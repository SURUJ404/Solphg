import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadWallet, saveWallet, clearWallet } from './wallet.js'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})

describe('wallet storage', () => {
  it('never persists the secret key', () => {
    saveWallet({ publicKey: 'pubkey', secretKey: 'deadbeef'.repeat(16), connected: true })
    const raw = localStorage.getItem('solpg_wallet')!
    expect(raw).not.toContain('deadbeef')
    expect(JSON.parse(raw).secretKey).toBe('')
  })

  it('loads only the public key and marks the secret as absent', () => {
    saveWallet({ publicKey: 'pubkey', secretKey: 'secret', connected: true })
    const loaded = loadWallet()!
    expect(loaded.publicKey).toBe('pubkey')
    expect(loaded.secretKey).toBe('')
    expect(loaded.connected).toBe(true)
  })

  it('migrates a legacy record that still contains a secret', () => {
    localStorage.setItem(
      'solpg_wallet',
      JSON.stringify({ publicKey: 'pubkey', secretKey: 'abcdef0123456789', connected: true }),
    )
    sessionStorage.setItem('solpg_enc_key', 'a'.repeat(64))
    const loaded = loadWallet()!
    expect(loaded.secretKey).toBe('')
    expect(localStorage.getItem('solpg_wallet')).not.toContain('abcdef0123456789')
    expect(sessionStorage.getItem('solpg_enc_key')).toBeNull()
  })

  it('clears the wallet and legacy session key', () => {
    saveWallet({ publicKey: 'pubkey', secretKey: '', connected: true })
    sessionStorage.setItem('solpg_enc_key', 'x')
    clearWallet()
    expect(loadWallet()).toBeNull()
    expect(sessionStorage.getItem('solpg_enc_key')).toBeNull()
  })

  it('returns null for malformed records', () => {
    localStorage.setItem('solpg_wallet', '{not json')
    expect(loadWallet()).toBeNull()
  })
})
