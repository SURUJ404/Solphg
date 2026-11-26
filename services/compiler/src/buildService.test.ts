import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BuildQueueFullError,
  BuildTimeoutError,
  SandboxedBuildService,
  syncDeclareId,
  validateRequest,
  normalizeFilePath,
  runBuild,
} from './buildService'
import type { BuildRequest } from './types'

const FAKE_ANCHOR = fileURLToPath(new URL('../test/fixtures/fake-anchor.mjs', import.meta.url))
const PROGRAM_ID = '11111111111111111111111111111111'
const SOURCE = `use anchor_lang::prelude::*;

declare_id!("${PROGRAM_ID}");

#[program]
pub mod counter {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> { Ok(()) }
}

#[derive(Accounts)]
pub struct Initialize {}
`

function validReq(overrides?: Partial<BuildRequest>): BuildRequest {
  return {
    programName: 'my_counter',
    files: [{ path: 'src/lib.rs', content: 'fn main() {}' }],
    ...overrides,
  }
}

let dir: string
const saved: Record<string, string | undefined> = {}
const MANAGED = [
  'ANCHOR_BIN',
  'BUILD_CACHE_DIR',
  'BUILD_WORK_DIR',
  'CANONICAL_ANCHOR_LOCK',
  'SOLANA_SHARED_HOME',
  'MAX_CONCURRENT_BUILDS',
  'BUILD_TIMEOUT_MS',
  'TOOLCHAIN_TAG',
  'FAKE_ANCHOR_MODE',
  'FAKE_ANCHOR_COUNTER',
  'BUILD_CACHE_MAX_ENTRIES',
]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'solphg-build-'))
  for (const key of MANAGED) saved[key] = process.env[key]
  process.env.ANCHOR_BIN = FAKE_ANCHOR
  process.env.BUILD_CACHE_DIR = join(dir, 'cache')
  process.env.BUILD_WORK_DIR = join(dir, 'work')
  process.env.CANONICAL_ANCHOR_LOCK = join(dir, 'missing.lock')
  delete process.env.SOLANA_SHARED_HOME
  process.env.MAX_CONCURRENT_BUILDS = '2'
  process.env.BUILD_TIMEOUT_MS = '30000'
  process.env.TOOLCHAIN_TAG = 'test-toolchain'
  process.env.FAKE_ANCHOR_MODE = 'ok'
  process.env.FAKE_ANCHOR_COUNTER = join(dir, 'count.txt')
  process.env.BUILD_CACHE_MAX_ENTRIES = '50'
})

afterEach(async () => {
  for (const key of MANAGED) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  await rm(dir, { recursive: true, force: true }).catch(() => {})
})

async function invocationCount(): Promise<number> {
  try {
    const raw = await readFile(process.env.FAKE_ANCHOR_COUNTER!, 'utf8')
    return raw.trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

async function waitForInvocations(n: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if ((await invocationCount()) >= n) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`fake anchor was not invoked ${n} time(s)`)
}

async function listCacheFiles(): Promise<string[]> {
  const out: string[] = []
  const walk = async (p: string): Promise<void> => {
    for (const entry of await readdir(p, { withFileTypes: true }).catch(() => [])) {
      const full = join(p, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out.push(full)
    }
  }
  await walk(process.env.BUILD_CACHE_DIR!)
  return out
}

describe('validateRequest', () => {
  it('accepts a valid request', () => {
    expect(validateRequest(validReq())).toBeNull()
  })

  it('rejects missing programName', () => {
    expect(validateRequest(validReq({ programName: '' }))).toMatch(/programName/)
  })

  it('rejects invalid programName with uppercase', () => {
    expect(validateRequest(validReq({ programName: 'MyCounter' }))).toMatch(/programName/)
  })

  it('rejects programName with special chars', () => {
    expect(validateRequest(validReq({ programName: 'my;counter' }))).toMatch(/programName/)
    expect(validateRequest(validReq({ programName: 'my counter' }))).toMatch(/programName/)
  })

  it('rejects programName that is too long', () => {
    expect(validateRequest(validReq({ programName: 'a'.repeat(65) }))).toMatch(/programName/)
  })

  it('accepts programName with underscores and hyphens', () => {
    expect(validateRequest(validReq({ programName: 'my_counter-v2' }))).toBeNull()
  })

  it('rejects an invalid programId', () => {
    expect(validateRequest(validReq({ programId: 'not-a-key' }))).toMatch(/programId/)
  })

  it('rejects empty files array', () => {
    expect(validateRequest(validReq({ files: [] }))).toMatch(/non-empty/)
  })

  it('rejects too many files', () => {
    const files = Array.from({ length: 41 }, (_, i) => ({ path: `file${i}.rs`, content: '' }))
    expect(validateRequest(validReq({ files }))).toMatch(/too many/)
  })

  it('rejects absolute file path', () => {
    const files = [{ path: '/etc/passwd', content: '' }]
    expect(validateRequest(validReq({ files }))).toMatch(/invalid file path/)
  })

  it('rejects path traversal', () => {
    const files = [{ path: '../../secret.json', content: '' }]
    expect(validateRequest(validReq({ files }))).toMatch(/invalid file path/)
  })

  it('rejects Windows-style path traversal', () => {
    const files = [{ path: '..\\..\\secret.json', content: '' }]
    expect(validateRequest(validReq({ files }))).toMatch(/invalid file path/)
  })

  it('rejects oversized file', () => {
    const files = [{ path: 'big.rs', content: 'x'.repeat(200_001) }]
    expect(validateRequest(validReq({ files }))).toMatch(/file too large/)
  })
})

describe('normalizeFilePath', () => {
  it('keeps src-relative paths as-is', () => {
    expect(normalizeFilePath('lib.rs', 'myproject')).toBe('lib.rs')
    expect(normalizeFilePath('instructions/mod.rs', 'myproject')).toBe('instructions/mod.rs')
  })

  it('strips a leading src/ prefix', () => {
    expect(normalizeFilePath('src/lib.rs', 'myproject')).toBe('lib.rs')
    expect(normalizeFilePath('src/instructions/mod.rs', 'myproject')).toBe('instructions/mod.rs')
  })

  it('strips a project-root programs/<name>/src prefix', () => {
    expect(normalizeFilePath('programs/myproject/src/lib.rs', 'myproject')).toBe('lib.rs')
    expect(normalizeFilePath('programs/spl_transfer/src/lib.rs', 'spl-transfer')).toBe('lib.rs')
    expect(normalizeFilePath('programs/coinflip/src/lib.rs', 'coinflip')).toBe('lib.rs')
  })

  it('strips any programs/<crate>/src prefix regardless of programName', () => {
    expect(normalizeFilePath('programs/other/src/lib.rs', 'myproject')).toBe('lib.rs')
  })
})

describe('syncDeclareId', () => {
  it('rewrites declare_id to the generated program id', () => {
    const synced = syncDeclareId({ 'lib.rs': SOURCE }, 'So11111111111111111111111111111111111111112')
    expect(synced['lib.rs']).toContain('declare_id!("So11111111111111111111111111111111111111112")')
  })

  it('injects declare_id when an Anchor source omits it', () => {
    const synced = syncDeclareId({ 'lib.rs': 'use anchor_lang::prelude::*;\n' }, PROGRAM_ID)
    expect(synced['lib.rs']).toContain(`declare_id!("${PROGRAM_ID}")`)
  })

  it('leaves non-Anchor sources untouched', () => {
    const source = 'fn main() { println!("hi"); }'
    expect(syncDeclareId({ 'main.rs': source }, PROGRAM_ID)['main.rs']).toBe(source)
  })
})

describe('SandboxedBuildService', () => {
  it('compiles on a miss and serves the next identical build from cache', async () => {
    const service = new SandboxedBuildService()
    const input = { programName: 'counter', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } }

    const first = await service.build(input)
    expect(first.cached).toBe(false)
    expect(first.programId).toBe(PROGRAM_ID)
    expect(first.soBase64.length).toBeGreaterThan(0)
    expect(first.idlJson).toBeTruthy()
    expect(first.programKeypairBase64).toBeUndefined()
    expect(await invocationCount()).toBe(1)

    const second = await service.build(input)
    expect(second.cached).toBe(true)
    expect(second.soBase64).toBe(first.soBase64)
    expect(await invocationCount()).toBe(1)
  })

  it('misses the cache when source changes', async () => {
    const service = new SandboxedBuildService()
    await service.build({ programName: 'counter', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } })
    const changed = `${SOURCE}\n// changed\n`
    const second = await service.build({
      programName: 'counter',
      programId: PROGRAM_ID,
      files: { 'lib.rs': changed },
    })
    expect(second.cached).toBe(false)
    expect(await invocationCount()).toBe(2)
  })

  it('includes programName and toolchain tag in the cache key', () => {
    const service = new SandboxedBuildService()
    const base = { programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } }
    const a = service.computeCacheKey({ programName: 'alpha', ...base }, PROGRAM_ID)
    const b = service.computeCacheKey({ programName: 'beta', ...base }, PROGRAM_ID)
    expect(a).not.toBe(b)

    const oldTag = process.env.TOOLCHAIN_TAG
    process.env.TOOLCHAIN_TAG = 'other-toolchain'
    const c = service.computeCacheKey({ programName: 'alpha', ...base }, PROGRAM_ID)
    process.env.TOOLCHAIN_TAG = oldTag
    expect(c).not.toBe(a)
  })

  it('de-duplicates identical in-flight builds', async () => {
    process.env.FAKE_ANCHOR_MODE = 'sleep'
    const service = new SandboxedBuildService()
    const input = { programName: 'counter', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } }
    const [a, b] = await Promise.all([service.build(input), service.build(input)])
    expect(a.soBase64).toBe(b.soBase64)
    expect(await invocationCount()).toBe(1)
  })

  it('rejects when the queue is full', async () => {
    process.env.MAX_CONCURRENT_BUILDS = '1'
    process.env.FAKE_ANCHOR_MODE = 'sleep'
    const service = new SandboxedBuildService()

    const first = service.build({
      programName: 'counter',
      programId: PROGRAM_ID,
      files: { 'lib.rs': SOURCE },
    })
    await waitForInvocations(1)

    await expect(
      service.build({
        programName: 'other',
        programId: PROGRAM_ID,
        files: { 'lib.rs': `${SOURCE}\n// other\n` },
      }),
    ).rejects.toBeInstanceOf(BuildQueueFullError)

    await first
  })

  it('returns failure logs from a failed build', async () => {
    process.env.FAKE_ANCHOR_MODE = 'fail'
    const result = await runBuild({
      programName: 'counter',
      programId: PROGRAM_ID,
      files: [{ path: 'lib.rs', content: SOURCE }],
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('BUILD_FAILED')
    expect(result.logs).toContain('E0425')
  })

  it('kills the build on timeout', async () => {
    process.env.FAKE_ANCHOR_MODE = 'hang'
    process.env.BUILD_TIMEOUT_MS = '300'
    const service = new SandboxedBuildService()
    await expect(
      service.build({ programName: 'counter', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } }),
    ).rejects.toBeInstanceOf(BuildTimeoutError)
  }, 10_000)

  it('never stores a program keypair in the cache', async () => {
    const service = new SandboxedBuildService()
    const result = await service.build({
      programName: 'counter',
      files: { 'lib.rs': SOURCE },
    })
    expect(result.programId).toBeTruthy()
    expect(result.programKeypairBase64).toBeTruthy()

    const files = await listCacheFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file.toLowerCase()).not.toContain('keypair')
      const content = await readFile(file, 'utf8').catch(() => '')
      expect(content).not.toContain('secret')
      expect(content).not.toContain(result.programKeypairBase64!)
    }
  })

  it('generates a fresh keypair per request', async () => {
    const service = new SandboxedBuildService()
    const a = await service.build({ programName: 'counter', files: { 'lib.rs': SOURCE } })
    const b = await service.build({ programName: 'counter', files: { 'lib.rs': SOURCE } })
    expect(a.programId).not.toBe(b.programId)
    expect(a.programKeypairBase64).not.toBe(b.programKeypairBase64)
  })

  it('evicts old entries when the cache exceeds its bound', async () => {
    process.env.BUILD_CACHE_MAX_ENTRIES = '1'
    const service = new SandboxedBuildService()
    await service.build({ programName: 'one', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } })
    await service.build({
      programName: 'two',
      programId: PROGRAM_ID,
      files: { 'lib.rs': `${SOURCE}\n// two\n` },
    })
    const entries = (await readdir(process.env.BUILD_CACHE_DIR!)).filter((n) => !n.startsWith('.'))
    expect(entries).toHaveLength(1)
  })

  it('writes cache entries atomically and leaves no temp directories', async () => {
    const service = new SandboxedBuildService()
    await service.build({ programName: 'counter', programId: PROGRAM_ID, files: { 'lib.rs': SOURCE } })
    const entries = await readdir(process.env.BUILD_CACHE_DIR!)
    expect(entries.some((n) => n.startsWith('.tmp-'))).toBe(false)
    const [entry] = entries
    expect((await stat(join(process.env.BUILD_CACHE_DIR!, entry))).isDirectory()).toBe(true)
  })

  it('rejects path traversal at the service boundary', async () => {
    const service = new SandboxedBuildService()
    await expect(
      service.build({
        programName: 'counter',
        programId: PROGRAM_ID,
        files: { '../escape.rs': SOURCE },
      }),
    ).rejects.toThrow(/INVALID_PATH|escape|relative/i)
  })
})
