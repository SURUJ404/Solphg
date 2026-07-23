import type { WalletState } from './types.js'

const STORAGE_KEY = 'solpg_wallet'
const KEY_STORAGE_KEY = 'solpg_enc_key'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getOrCreateEncKey(): Uint8Array | null {
  try {
    const stored = sessionStorage?.getItem(KEY_STORAGE_KEY)
    if (stored) return hexToBytes(stored)
    const key = crypto.getRandomValues(new Uint8Array(32))
    sessionStorage?.setItem(KEY_STORAGE_KEY, bytesToHex(key))
    if (sessionStorage?.getItem(KEY_STORAGE_KEY) === bytesToHex(key)) return key
    return null
  } catch {
    return null
  }
}

function xor(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length]
  }
  return result
}

function encryptSecret(secretKey: string): string {
  const key = getOrCreateEncKey()
  if (!key) return secretKey
  const encoded = new TextEncoder().encode(secretKey)
  return bytesToHex(xor(encoded, key))
}

function decryptSecret(encrypted: string): string {
  const key = getOrCreateEncKey()
  if (!key) return encrypted
  const decoded = xor(hexToBytes(encrypted), key)
  return new TextDecoder().decode(decoded)
}

export function loadWallet(): WalletState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.secretKey) {
      parsed.secretKey = decryptSecret(parsed.secretKey)
    }
    return parsed
  } catch {
    return null
  }
}

export function saveWallet(w: WalletState): void {
  const toStore = { ...w }
  if (toStore.secretKey) {
    toStore.secretKey = encryptSecret(toStore.secretKey)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
}

export function clearWallet(): void {
  localStorage.removeItem(STORAGE_KEY)
  sessionStorage?.removeItem(KEY_STORAGE_KEY)
}
