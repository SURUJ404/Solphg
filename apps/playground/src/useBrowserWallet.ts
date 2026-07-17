import { useState, useEffect, useCallback, useRef } from 'react'

export interface DetectedWallet {
  name: string
  icon: string
  connect: () => Promise<string>
}

interface BrowserWalletState {
  wallets: DetectedWallet[]
  connected: boolean
  publicKey: string
  connecting: boolean
  connect: (name: string) => Promise<void>
  disconnect: () => Promise<void>
}

// Track wallet-standard wallets that register via custom event
let standardWalletsRegistry: any[] = []

function walletToDetected(w: any): DetectedWallet | null {
  const features = w.features
  const hasConnect = features && (features.includes('solana:connect') || features['solana:connect'])
  const hasSign = features && (features.includes('solana:signTransaction') || features['solana:signTransaction'])
  if (!hasConnect || !hasSign) return null
  const icon = typeof w.icon === 'string' ? w.icon : ''
  return {
    name: w.name,
    icon,
    connect: async () => {
      const connectFeature = features['solana:connect']?.connect || features['solana:connect']
      if (typeof connectFeature === 'function') {
        const account = await connectFeature()
        return account.publicKey
      }
      // Legacy: call connect() on the wallet itself
      const account = await w.connect()
      return account.publicKey
    },
  }
}

function scanStandardWallets(): DetectedWallet[] {
  const result: DetectedWallet[] = []

  // 1) Check navigator.wallets (wallet-standard browser API)
  const navWallets = (navigator as any)?.wallets
  if (navWallets?.get) {
    try {
      for (const w of navWallets.get()) {
        const dw = walletToDetected(w)
        if (dw) result.push(dw)
      }
    } catch {}
  }

  // 2) Merge from event-based registry (dedupe by name)
  for (const w of standardWalletsRegistry) {
    const dw = walletToDetected(w)
    if (dw && !result.some(r => r.name === dw.name)) {
      result.push(dw)
    }
  }

  return result
}

function scanLegacyWallets(): DetectedWallet[] {
  const result: DetectedWallet[] = []
  const seen = new Set<string>()

  const add = (name: string, provider: any) => {
    if (seen.has(name)) return
    seen.add(name)
    result.push({
      name,
      icon: '',
      connect: async () => {
        const resp = await provider.connect()
        return resp.publicKey.toString()
      },
    })
  }

  const solana = (window as any).solana
  if (solana) {
    if (solana.isPhantom) add('Phantom', solana)
    if (solana.isSolflare) add('Solflare', solana)
    if (solana.isBackpack) add('Backpack', solana)
  }

  // Backpack also exposes itself via window.backpack
  const bp = (window as any).backpack
  if (bp && bp.connect && !seen.has('Backpack')) {
    add('Backpack', bp)
  }

  return result
}

function detectWallets(): DetectedWallet[] {
  const standard = scanStandardWallets()
  const legacy = scanLegacyWallets()
  const combined = [...standard]
  for (const w of legacy) {
    if (!combined.some(c => c.name === w.name)) combined.push(w)
  }
  return combined
}

export function useBrowserWallet(): BrowserWalletState {
  const [wallets, setWallets] = useState<DetectedWallet[]>(() => detectWallets())
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const connectedRef = useRef(false)

  // Listen for wallet-standard:register-wallet events
  useEffect(() => {
    const onRegister = (event: any) => {
      const wallet = event.detail
      if (wallet) {
        // Remove any existing entry with the same name
        standardWalletsRegistry = standardWalletsRegistry.filter(w => w.name !== wallet.name)
        standardWalletsRegistry.push(wallet)
        setWallets(detectWallets())
      }
    }
    // Catch up with wallets already registered before this listener
    const already = standardWalletsRegistry.slice()
    if (already.length > 0) setWallets(detectWallets())

    window.addEventListener('wallet-standard:register-wallet', onRegister)
    return () => window.removeEventListener('wallet-standard:register-wallet', onRegister)
  }, [])

  // Poll for late-detected wallets and re-scan on visibility change
  useEffect(() => {
    const check = () => {
      const current = detectWallets()
      setWallets(prev => {
        if (JSON.stringify(prev.map(w => w.name)) !== JSON.stringify(current.map(w => w.name))) return current
        return prev
      })
    }
    const interval = setInterval(check, 2000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // Listen for legacy wallet connect/disconnect events
  useEffect(() => {
    const solana = (window as any).solana
    if (!solana || !solana.on) return
    const onConnect = (pubkey: any) => {
      const key = typeof pubkey === 'string' ? pubkey : pubkey?.toString?.() ?? ''
      if (key) { setPublicKey(key); setConnected(true); connectedRef.current = true }
    }
    const onDisconnect = () => {
      if (connectedRef.current) { setConnected(false); setPublicKey(''); connectedRef.current = false }
    }
    solana.on('connect', onConnect)
    solana.on('disconnect', onDisconnect)
    return () => { try { solana.off('connect', onConnect); solana.off('disconnect', onDisconnect) } catch {} }
  }, [])

  const connect = useCallback(async (name: string) => {
    setConnecting(true)
    try {
      const wallet = wallets.find(w => w.name === name)
      if (!wallet) throw new Error(`Wallet "${name}" not found`)
      const pubkey = await wallet.connect()
      setPublicKey(pubkey)
      setConnected(true)
      connectedRef.current = true
    } finally {
      setConnecting(false)
    }
  }, [wallets])

  const disconnect = useCallback(async () => {
    try { await (window as any).solana?.disconnect?.() } catch {}
    try { await (window as any).backpack?.disconnect?.() } catch {}
    setConnected(false)
    setPublicKey('')
    connectedRef.current = false
  }, [])

  return { wallets, connected, publicKey, connecting, connect, disconnect }
}
