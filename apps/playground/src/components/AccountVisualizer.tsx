import React, { useState, useMemo } from 'react'

interface Props {
  programId: string
  cluster: string
}

interface AccountNode {
  label: string
  address: string
  type: 'program' | 'pda' | 'signer' | 'system'
  children?: AccountNode[]
  details?: string
}

function tryDerivePda(programId: string, seed: string): string | null {
  try {
    const { PublicKey } = require('@solana/web3.js') as any
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from(seed)], new PublicKey(programId))
    return pda.toBase58()
  } catch {
    return null
  }
}

export function AccountVisualizer({ programId, cluster }: Props) {
  const [expanded, setExpanded] = useState(true)

  const pdaSeeds = [
    { label: 'Program Data Account', seeds: ['ProgramData'], details: 'Stores upgrade authority + program bytecode' },
    { label: 'Buffer Account', seeds: ['buffer'], details: 'Temporary staging for program writes' },
  ]

  const tree = useMemo<AccountNode[]>(() => {
    const children: AccountNode[] = []
    for (const s of pdaSeeds) {
      const addr = tryDerivePda(programId, s.seeds[0])
      children.push({
        label: s.label,
        address: addr || `PDA(seeds=${s.seeds[0]})`,
        type: 'pda',
        details: s.details,
      })
    }
    return [
      {
        label: 'Program',
        address: programId,
        type: 'program',
        details: 'Executable account — deployed program code lives here',
        children,
      },
    {
      label: 'Authority (Signer)',
      address: 'Your wallet public key',
      type: 'signer',
      details: 'The wallet that pays for deployment and owns the upgrade authority',
    },
    {
      label: 'System Program',
      address: '11111111111111111111111111111111',
      type: 'system',
      details: 'Creates program account and allocates space',
    },
  ]

  const explorerUrl = cluster === 'mainnet-beta'
    ? `https://explorer.solana.com/address/${programId}`
    : `https://explorer.solana.com/address/${programId}?cluster=${cluster}`

  return (
    <div className="account-visualizer" style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontSize: 11 }}>
      <div
        style={{ padding: '8px 12px', background: 'var(--bg-hover)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(!expanded)}
      >
        <strong>Accounts this transaction touches</strong>
        <span>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '8px 12px' }}>
          <div style={{ marginBottom: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            Shows accounts that would be created/accessed during deploy on <strong>{cluster}</strong>.
            <a href={explorerUrl} target="_blank" rel="noopener" style={{ marginLeft: 6, color: 'var(--accent)' }}>View on Explorer ↗</a>
          </div>
          {tree.map((node, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <NodeIcon type={node.type} />
                <strong>{node.label}</strong>
              </div>
              <div style={{ marginLeft: 22, color: 'var(--text-muted)', fontSize: 10 }}>
                <code style={{ fontSize: 10 }}>{node.address}</code>
              </div>
              {node.details && (
                <div style={{ marginLeft: 22, fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>
                  {node.details}
                </div>
              )}
              {node.children && (
                <div style={{ marginLeft: 22, marginTop: 4, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                  {node.children.map((child, j) => (
                    <div key={j} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <NodeIcon type={child.type} />
                        <span>{child.label}</span>
                      </div>
                      <div style={{ marginLeft: 22, fontSize: 10, color: 'var(--text-muted)' }}>
                        <code style={{ fontSize: 10 }}>{child.address}</code>
                      </div>
                      {child.details && (
                        <div style={{ marginLeft: 22, fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>
                          {child.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ marginTop: 8, padding: 6, background: 'var(--bg)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            💡 <strong>Why this matters:</strong> Solana requires every account to be declared upfront. Unlike EVM where contracts
            access state implicitly, Solana programs list all accounts in the instruction — this is what makes transactions
            parallelizable. The accounts above are <em>everything</em> the deploy instruction will read or write.
          </div>
        </div>
      )}
    </div>
  )
}

function NodeIcon({ type }: { type: AccountNode['type'] }) {
  const icons: Record<string, string> = {
    program: '⬡',
    pda: '◆',
    signer: '👤',
    system: '⚙',
  }
  return <span style={{ fontSize: 12 }}>{icons[type] || '•'}</span>
}
