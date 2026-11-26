import type { WalletState } from './types.js'

const STORAGE_KEY = 'solpg_wallet'
const LEGACY_SESSION_KEY = 'solpg_enc_key'

/**
 * Secret keys are never written to persistent storage.
 *
 * Earlier versions XOR-"encrypted" the secret with a key stored alongside it in
 * sessionStorage, which is reversible by any script on the origin. We now keep
 * the secret only in React memory for the lifetime of the tab. Reloading the
 * page keeps the public key (for balances/airdrops) and requires re-importing
 * or re-generating a key to sign transactions.
 */
export function loadWallet(): WalletState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WalletState>
    if (typeof parsed.publicKey !== 'string' || !parsed.publicKey) return null
    const safe: WalletState = {
      publicKey: parsed.publicKey,
      secretKey: '',
      connected: Boolean(parsed.connected),
    }
    // Migrate any legacy record by rewriting it without the secret material.
    if (parsed.secretKey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
    }
    try {
      sessionStorage?.removeItem(LEGACY_SESSION_KEY)
    } catch {
      /* sessionStorage unavailable */
    }
    return safe
  } catch {
    return null
  }
}

export function saveWallet(w: WalletState): void {
  try {
    // Deliberately drop w.secretKey — never persist secret bytes.
    const safe: WalletState = {
      publicKey: w.publicKey,
      secretKey: '',
      connected: Boolean(w.connected),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
  } catch {
    /* localStorage unavailable (SSR, private browsing, extension blocking) */
  }
}

export function clearWallet(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage?.removeItem(LEGACY_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
