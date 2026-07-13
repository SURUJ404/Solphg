import React from 'react'

interface Props {
  connected: boolean
  publicKey: string
  onConnect: () => void
  onDisconnect: () => void
}

export function WalletPanel({ connected, publicKey, onConnect, onDisconnect }: Props) {
  return (
    <div className="wallet-panel">
      <div className="panel-title">Wallet</div>
      {connected ? (
        <div className="wallet-info">
          <div className="wallet-status connected">Connected</div>
          <div className="wallet-address">
            <span className="label">Address:</span>
            <code>{publicKey.slice(0, 8)}...{publicKey.slice(-4)}</code>
          </div>
          <button className="btn btn-secondary" onClick={onDisconnect} style={{ marginTop: 8 }}>
            Disconnect
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={onConnect}>
          Generate Wallet
        </button>
      )}
    </div>
  )
}
