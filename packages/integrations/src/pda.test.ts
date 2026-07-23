import { describe, it, expect } from 'vitest'
import { findProgramAddress } from './pda'
import { PublicKey } from '@solana/web3.js'

describe('findProgramAddress', () => {
  it('returns address and bump for valid seeds', () => {
    const programId = new PublicKey('11111111111111111111111111111111')
    const result = findProgramAddress([Buffer.from('hello')], programId)
    expect(result).toHaveProperty('address')
    expect(result).toHaveProperty('bump')
    expect(result.address).toBeInstanceOf(PublicKey)
    expect(typeof result.bump).toBe('number')
    expect(result.bump).toBeGreaterThanOrEqual(0)
    expect(result.bump).toBeLessThanOrEqual(255)
  })

  it('returns consistent results for same seeds', () => {
    const programId = new PublicKey('11111111111111111111111111111111')
    const a = findProgramAddress([Buffer.from('test')], programId)
    const b = findProgramAddress([Buffer.from('test')], programId)
    expect(a.address.toBase58()).toBe(b.address.toBase58())
    expect(a.bump).toBe(b.bump)
  })

  it('returns different addresses for different seeds', () => {
    const programId = new PublicKey('11111111111111111111111111111111')
    const a = findProgramAddress([Buffer.from('seed1')], programId)
    const b = findProgramAddress([Buffer.from('seed2')], programId)
    expect(a.address.toBase58()).not.toBe(b.address.toBase58())
  })

  it('handles multiple seed buffers', () => {
    const programId = new PublicKey('11111111111111111111111111111111')
    const result = findProgramAddress([Buffer.from('a'), Buffer.from('b')], programId)
    expect(result.address).toBeInstanceOf(PublicKey)
    expect(typeof result.bump).toBe('number')
  })

  it('works with empty seed', () => {
    const programId = new PublicKey('11111111111111111111111111111111')
    const result = findProgramAddress([Buffer.from([])], programId)
    expect(result.address).toBeInstanceOf(PublicKey)
  })
})
