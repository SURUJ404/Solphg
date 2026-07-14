import React from 'react'

interface Props {
  connected: boolean
  publicKey: string
  onConnect: () => void
  onDisconnect: () => void
}

export function WalletPanel({ connected, publicKey, onConnect, onDisconnect }: Props) {
  if (!connected) {
    return (
      <button className="btn btn-secondary" onClick={onConnect} style={{ width: '100%' }}>
        Generate Wallet
      </button>
    )
  }

  return (
    <>
      <div className="wallet-status">Connected</div>
      <div className="wallet-address">
        {publicKey.slice(0, 8)}...{publicKey.slice(-4)}
      </div>
      <button className="btn btn-secondary" onClick={onDisconnect} style={{ width: '100%', marginTop: 6 }}>
        Disconnect
      </button>
    </>
  )
}
