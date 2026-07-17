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

function detectWallets(): DetectedWallet[] {
  const result: DetectedWallet[] = []

  // Detect wallet-standard compliant wallets
  const standardWallets = (navigator as any)?.wallets
  if (standardWallets?.get) {
    try {
      const wallets = standardWallets.get()
      for (const w of wallets) {
        const features = w.features
        if (features?.includes('solana:connect') && features?.includes('solana:signTransaction')) {
          const icon = w.icon
          result.push({
            name: w.name,
            icon: typeof icon === 'string' ? icon : '',
            connect: async () => {
              const account = await w.features['solana:connect'].connect()
              return account.publicKey
            },
          })
        }
      }
    } catch {}
  }

  // Detect legacy window.solana wallets
  const providers = new Set<string>()
  const solana = (window as any).solana
  if (solana?.isPhantom) {
    const name = 'Phantom'
    if (!providers.has(name)) {
      providers.add(name)
      result.push({
        name,
        icon: '',
        connect: async () => {
          const resp = await solana.connect()
          return resp.publicKey.toString()
        },
      })
    }
  }
  if (solana?.isSolflare) {
    const name = 'Solflare'
    if (!providers.has(name)) {
      providers.add(name)
      result.push({
        name,
        icon: '',
        connect: async () => {
          const resp = await solana.connect()
          return resp.publicKey.toString()
        },
      })
    }
  }
  if (solana?.isBackpack) {
    const name = 'Backpack'
    if (!providers.has(name)) {
      providers.add(name)
      result.push({
        name,
        icon: '',
        connect: async () => {
          const resp = await solana.connect()
          return resp.publicKey.toString()
        },
      })
    }
  }

  return result
}

export function useBrowserWallet(): BrowserWalletState {
  const [wallets, setWallets] = useState<DetectedWallet[]>(() => detectWallets())
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const connectedRef = useRef(false)

  // Re-detect wallets when window.solana changes (e.g., extension loads after page)
  useEffect(() => {
    const check = () => setWallets(detectWallets())
    const interval = setInterval(check, 2000)
    // Also check on visibility change (user might install extension)
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
    setConnected(false)
    setPublicKey('')
    connectedRef.current = false
  }, [])

  return { wallets, connected, publicKey, connecting, connect, disconnect }
}
