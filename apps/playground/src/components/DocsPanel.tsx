import React from 'react'

export function DocsPanel() {
  return (
    <div className="docs-panel">
      <div className="docs-section">
        <h3>Airdrop SOL</h3>
        <p>Get devnet SOL to deploy and test your Solana programs.</p>
        <ol>
          <li>Click <strong>AirDrop SOL</strong> in the Wallet panel.</li>
          <li>If that fails, the backend faucet wallet needs refilling.</li>
        </ol>
      </div>

      <div className="docs-section">
        <h3>Fund the Faucet Wallet</h3>
        <p>The app uses a pre-funded faucet wallet to send SOL without rate limits. When it runs low, refill it:</p>
        <ol>
          <li><strong>Get devnet SOL</strong> from any web faucet (different IP = fresh quota):<br />
            <a href="https://solfaucet.com" target="_blank" rel="noopener">solfaucet.com</a> &mdash; select Devnet, paste address<br />
            <a href="https://www.devnetfaucet.org" target="_blank" rel="noopener">devnetfaucet.org</a> &mdash; paste address<br />
            <a href="https://faucet.quicknode.com/solana/devnet" target="_blank" rel="noopener">QuickNode Faucet</a> &mdash; connect Backpack wallet<br />
            <a href="https://faucet.solana.com" target="_blank" rel="noopener">Solana Faucet</a> &mdash; requires GitHub + small mainnet balance
          </li>
          <li><strong>Send SOL</strong> to the faucet wallet address:<br />
            <code>3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR</code>
          </li>
          <li><strong>Wait</strong> &mdash; once the faucet has SOL, the airdrop works instantly with no rate limits.</li>
        </ol>
      </div>

      <div className="docs-section">
        <h3>Rate Limits</h3>
        <p>Public devnet RPCs limit <code>requestAirdrop</code> to ~1 SOL/day per IP. The faucet-transfer method bypasses this entirely.</p>
        <ul>
          <li>If airdrop fails, the faucet wallet is probably low.</li>
          <li>Refill it using one of the web faucets above.</li>
          <li>Each web faucet has its own rate limits &mdash; try a different one if one is exhausted.</li>
        </ul>
      </div>

      <div className="docs-section">
        <h3>Faucet Address</h3>
        <code className="docs-address">3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR</code>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => navigator.clipboard.writeText('3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR')}>
          Copy Address
        </button>
      </div>
    </div>
  )
}
