import { describe, expect, it } from 'vitest'
import { runFile, runFileOrThrow, toolEnv } from './exec'

describe('toolEnv', () => {
  it('keeps only allowlisted keys', () => {
    const env = toolEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      FAUCET_SECRET_KEY: 'a'.repeat(128),
      ADMIN_TOKEN: 'top-secret',
      DEVNET_RPC_URL: 'https://secret.example',
      CUSTOM_SECRET: 'nope',
    })
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/user')
    expect(env.FAUCET_SECRET_KEY).toBeUndefined()
    expect(env.ADMIN_TOKEN).toBeUndefined()
    expect(env.DEVNET_RPC_URL).toBeUndefined()
    expect(env.CUSTOM_SECRET).toBeUndefined()
  })
})

describe('runFile', () => {
  it('executes commands with argument arrays and captures output', async () => {
    const result = await runFile(process.execPath, ['-e', 'process.stdout.write("hello")'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('hello')
    expect(result.timedOut).toBe(false)
  })

  it('passes arguments literally, without shell interpretation', async () => {
    // With a shell, $(...) would be evaluated; with spawn(arg[]) it stays literal.
    const evil = '$(echo PWNED)'
    const result = await runFile(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', evil])
    expect(result.stdout).toBe(evil)
  })

  it('reports non-zero exit codes and stderr', async () => {
    const result = await runFile(process.execPath, ['-e', 'process.stderr.write("boom"); process.exit(7)'])
    expect(result.code).toBe(7)
    expect(result.stderr).toBe('boom')
  })

  it('kills the child on timeout', async () => {
    const result = await runFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 100,
    })
    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
  })

  it('uses the scrubbed environment by default', async () => {
    const prior = process.env.FAUCET_SECRET_KEY
    process.env.FAUCET_SECRET_KEY = 'a'.repeat(128)
    try {
      const result = await runFile(process.execPath, [
        '-e',
        'process.stdout.write(String(process.env.FAUCET_SECRET_KEY || "clean"))',
      ])
      expect(result.stdout).toBe('clean')
    } finally {
      if (prior === undefined) delete process.env.FAUCET_SECRET_KEY
      else process.env.FAUCET_SECRET_KEY = prior
    }
  })

  it('runFileOrThrow throws with a bounded message', async () => {
    await expect(
      runFileOrThrow(process.execPath, ['-e', 'process.exit(3)']),
    ).rejects.toThrow(/failed \(3\)/)
  })
})
