import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import {
  decodeBase64Bounded,
  firstErrorLine,
  isCluster,
  isValidAddress,
  isValidSecretHex,
  parseSolAmount,
  resolveRpc,
  safeTokenEqual,
} from './security'
import type { AppConfig } from './config'

describe('security validators', () => {
  it('accepts only canonical base58 public keys', () => {
    const kp = Keypair.generate()
    const address = kp.publicKey.toBase58()
    expect(isValidAddress(address)).toBe(true)
    expect(isValidAddress(address.slice(0, -1) + '0')).toBe(false)
    expect(isValidAddress('not-an-address')).toBe(false)
    expect(isValidAddress(123)).toBe(false)
    // Shell metacharacters must never pass.
    expect(isValidAddress('abc; rm -rf /')).toBe(false)
  })

  it('validates secret hex length', () => {
    expect(isValidSecretHex('a'.repeat(128))).toBe(true)
    expect(isValidSecretHex('A'.repeat(128))).toBe(true)
    expect(isValidSecretHex('a'.repeat(127))).toBe(false)
    expect(isValidSecretHex('z'.repeat(128))).toBe(false)
    expect(isValidSecretHex(Buffer.alloc(64))).toBe(false)
  })

  it('allows only known clusters', () => {
    expect(isCluster('devnet')).toBe(true)
    expect(isCluster('testnet')).toBe(true)
    expect(isCluster('mainnet-beta')).toBe(true)
    expect(isCluster('mainnet')).toBe(false)
    expect(isCluster('https://evil.example')).toBe(false)
  })

  it('resolves RPC URLs from config, never from user input', () => {
    const config = {
      devnetRpcUrl: 'https://devnet.example',
      mainnetRpcUrl: 'https://mainnet.example',
    } as AppConfig
    expect(resolveRpc('devnet', config)).toBe('https://devnet.example')
    expect(resolveRpc('mainnet-beta', config)).toBe('https://mainnet.example')
    expect(resolveRpc('testnet', config)).toBe('https://api.testnet.solana.com')
  })

  it('decodes bounded base64 and rejects malformed or oversized input', () => {
    const payload = Buffer.from('hello solphg')
    expect(decodeBase64Bounded(payload.toString('base64'), 100)?.toString()).toBe('hello solphg')
    expect(decodeBase64Bounded(payload.toString('base64'), 2)).toBeNull()
    expect(decodeBase64Bounded('not base64!!', 100)).toBeNull()
    expect(decodeBase64Bounded('', 100)).toBeNull()
    expect(decodeBase64Bounded(42, 100)).toBeNull()
  })

  it('parses SOL amounts with a cap', () => {
    expect(parseSolAmount('2', 5)).toBe(2)
    expect(parseSolAmount(0.000000001, 5)).toBe(0.000000001)
    expect(parseSolAmount('0', 5)).toBeNull()
    expect(parseSolAmount('-1', 5)).toBeNull()
    expect(parseSolAmount('6', 5)).toBeNull()
    expect(parseSolAmount('abc', 5)).toBeNull()
    expect(parseSolAmount(Infinity, 5)).toBeNull()
  })

  it('compares tokens in constant time and rejects mismatched lengths', () => {
    expect(safeTokenEqual('secret', 'secret')).toBe(true)
    expect(safeTokenEqual('secret', 'secreX')).toBe(false)
    expect(safeTokenEqual('short', 'longer')).toBe(false)
    expect(safeTokenEqual('', '')).toBe(false)
  })

  it('returns a single safe error line', () => {
    expect(firstErrorLine('', 'first line\nsecond line')).toBe('first line')
    expect(firstErrorLine('error detail\nmore', 'ignored')).toBe('error detail')
    expect(firstErrorLine('', '')).toBe('command failed with no output')
    expect(firstErrorLine('x'.repeat(1000), '')).toHaveLength(500)
  })
})
