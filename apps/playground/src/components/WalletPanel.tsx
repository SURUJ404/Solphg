import React, { useState } from 'react'

interface Props {
  connected: boolean
  publicKey: string
  secretKey: string
  balance: number | null
  onConnect: () => void
  onDisconnect: () => void
  onAirdrop: () => void
  onImport: (secretKey: string) => void
  isAirdropping: boolean
}

export function WalletPanel({ connected, publicKey, secretKey, balance, onConnect, onDisconnect, onAirdrop, onImport, isAirdropping }: Props) {
  const [copied, setCopied] = useState<'pubkey' | 'secret' | null>(null)
  const [importKey, setImportKey] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const copyToClipboard = async (text: string, type: 'pubkey' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }

  if (!connected) {
    return (
      <div className="wallet-panel">
        <button className="btn btn-secondary" onClick={onConnect} style={{ width: '100%' }}>
          Generate Wallet
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setShowImport(!showImport)}
          style={{ width: '100%', marginTop: 6, fontSize: 12 }}
        >
          {showImport ? 'Cancel' : 'Import Wallet'}
        </button>
        {showImport && (
          <div style={{ marginTop: 8 }}>
            <input
              type="text"
              placeholder="Paste secret key (hex)..."
              value={importKey}
              onChange={e => setImportKey(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '4px 6px' }}
            />
            <button
              className="btn btn-secondary"
              onClick={() => { onImport(importKey.trim()); setImportKey(''); setShowImport(false) }}
              disabled={!importKey.trim()}
              style={{ width: '100%', marginTop: 4, fontSize: 11 }}
            >
              Import
            </button>
          </div>
        )}
      </div>
    )
  }

  const shortPubkey = `${publicKey.slice(0, 4)}..${publicKey.slice(-4)}`

  return (
    <div className="wallet-panel">
      <div className="wallet-status">Connected</div>
      <div
        className="wallet-address"
        onClick={() => copyToClipboard(publicKey, 'pubkey')}
        title="Click to copy"
        style={{ cursor: 'pointer' }}
      >
        {copied === 'pubkey' ? 'Copied!' : shortPubkey}
      </div>
      <div className="wallet-balance">
        {balance !== null ? `◎ ${balance}` : '---'}
      </div>
      <div className="wallet-actions">
        <button className="btn btn-secondary btn-sm" onClick={onAirdrop} disabled={isAirdropping}>
          {isAirdropping ? 'Airdropping...' : 'AirDrop SOL'}
        </button>
      </div>
      <div className="wallet-secret-section">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!showSecret) setShowSecret(true)
            else copyToClipboard(secretKey, 'secret')
          }}
          style={{ fontSize: 11 }}
        >
          {copied === 'secret' ? 'Copied!' : (showSecret ? 'Copy Secret Key' : 'Show Secret Key')}
        </button>
        {showSecret && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 4 }}>
            {secretKey ? `${secretKey.slice(0, 16)}...` : 'Not available'}
          </div>
        )}
      </div>
      <button className="btn btn-secondary" onClick={onDisconnect} style={{ width: '100%', marginTop: 6 }}>
        Disconnect
      </button>
    </div>
  )
}
