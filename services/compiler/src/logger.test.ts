import { describe, expect, it } from 'vitest'
import { redact, redactText } from './logger'

describe('redactText', () => {
  it('redacts 64-byte hex secret keys', () => {
    const key = 'ab'.repeat(64)
    expect(redactText(`using key ${key}`)).toBe('using key [redacted-key]')
  })

  it('redacts 64-byte base64 secret keys', () => {
    const key = Buffer.alloc(64, 7).toString('base64')
    expect(key).toMatch(/={2}$/)
    expect(redactText(`key=${key}`)).toBe('key=[redacted-key]')
  })

  it('leaves normal text untouched', () => {
    expect(redactText('build succeeded in 12s')).toBe('build succeeded in 12s')
  })
})

describe('redact', () => {
  it('redacts secret-looking fields in structured logs', () => {
    const result = redact({
      requestId: 'abc-123',
      authoritySecretKey: 'deadbeef',
      FAUCET_SECRET_KEY: 'cafebabe',
      adminToken: 'token',
      publicKey: 'So11111111111111111111111111111111111111112',
    })
    expect(result).toEqual({
      requestId: 'abc-123',
      authoritySecretKey: '[redacted]',
      FAUCET_SECRET_KEY: '[redacted]',
      adminToken: '[redacted]',
      publicKey: 'So11111111111111111111111111111111111111112',
    })
  })

  it('redacts nested structures and arrays', () => {
    const result = redact({
      items: [{ secretKey: 'abc' }, { nested: { programKeypair: 'xyz' } }],
    })
    expect(result).toEqual({
      items: [{ secretKey: '[redacted]' }, { nested: { programKeypair: '[redacted]' } }],
    })
  })

  it('redacts secrets embedded in string values', () => {
    const key = 'cd'.repeat(64)
    expect(redact({ message: `failed with ${key}` })).toEqual({
      message: 'failed with [redacted-key]',
    })
  })
})
