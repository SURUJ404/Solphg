import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FaucetLedger } from './faucet'

const ADDRESS_A = '11111111111111111111111111111111'
const ADDRESS_B = 'So11111111111111111111111111111111111111112'
const SOL = 1e9

let dir: string
let stateFile: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'solphg-faucet-'))
  stateFile = join(dir, 'nested', 'state.json')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true }).catch(() => {})
})

function ledger(dailyCapSol = 5, cooldownSeconds = 3600) {
  return new FaucetLedger(stateFile, dailyCapSol, cooldownSeconds)
}

describe('FaucetLedger', () => {
  it('records reservations and reports remaining allowance', async () => {
    const l = ledger()
    const r = await l.reserve(ADDRESS_A, 2 * SOL)
    expect(r.ok).toBe(true)
    expect(r.spentTodaySol).toBe(2)
    expect(r.remainingTodaySol).toBe(3)
  })

  it('enforces a per-address cooldown', async () => {
    const l = ledger()
    expect((await l.reserve(ADDRESS_A, 1 * SOL)).ok).toBe(true)
    const second = await l.reserve(ADDRESS_A, 1 * SOL)
    expect(second.ok).toBe(false)
    expect(second.retryAfterSec).toBeGreaterThan(0)
    expect((await l.reserve(ADDRESS_B, 1 * SOL)).ok).toBe(true)
  })

  it('enforces the daily cap globally', async () => {
    const l = ledger(2, 0)
    expect((await l.reserve(ADDRESS_A, 2 * SOL)).ok).toBe(true)
    const denied = await l.reserve(ADDRESS_B, 1 * SOL)
    expect(denied.ok).toBe(false)
    expect(denied.reason).toMatch(/Daily faucet spending cap/)
  })

  it('refunds a failed transfer', async () => {
    const l = ledger()
    await l.reserve(ADDRESS_A, 1 * SOL)
    await l.refund(ADDRESS_A, 1 * SOL)
    expect(l.snapshot().spentTodaySol).toBe(0)
    // Cooldown is released after refund.
    expect((await l.reserve(ADDRESS_A, 1 * SOL)).ok).toBe(true)
  })

  it('persists state to disk and reloads it after a restart', async () => {
    const first = ledger()
    await first.reserve(ADDRESS_A, 2 * SOL)

    const raw = await readFile(stateFile, 'utf8')
    expect(JSON.parse(raw).spentLamports).toBe(2 * SOL)
    expect(JSON.parse(raw).cooldowns[ADDRESS_A]).toBeGreaterThan(Date.now())

    const restarted = ledger()
    await restarted.init()
    expect(restarted.snapshot().spentTodaySol).toBe(2)
    expect((await restarted.reserve(ADDRESS_A, 1 * SOL)).ok).toBe(false)
  })

  it('rolls over the daily cap on a new UTC day', async () => {
    const l = ledger(2, 0)
    await l.reserve(ADDRESS_A, 2 * SOL)
    expect((await l.reserve(ADDRESS_B, 1 * SOL)).ok).toBe(false)

    vi.setSystemTime(new Date('2026-01-16T00:00:01Z'))
    expect((await l.reserve(ADDRESS_B, 1 * SOL)).ok).toBe(true)
    expect(l.snapshot().spentTodaySol).toBe(1)
  })

  it('serialises concurrent reservations so the cap cannot be overspent', async () => {
    const l = ledger(2, 0)
    const results = await Promise.all([
      l.reserve(ADDRESS_A, 2 * SOL),
      l.reserve(ADDRESS_B, 2 * SOL),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(l.snapshot().spentTodaySol).toBe(2)
  })
})
