import type { WalletState } from './types.js'

const STORAGE_KEY = 'solpg_wallet'

export function loadWallet(): WalletState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveWallet(w: WalletState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
}

export function clearWallet(): void {
  localStorage.removeItem(STORAGE_KEY)
}
