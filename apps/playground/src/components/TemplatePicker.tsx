import React from 'react'

interface ProjectTemplate {
  name: string
  label?: string
  description?: string
  difficulty?: string
  features?: string[]
}

const TEMPLATES: (ProjectTemplate & { factory: string })[] = [
  {
    name: 'anchor-project',
    label: 'Counter (Anchor)',
    description: 'Minimal Anchor program with a single initialize instruction',
    difficulty: 'Beginner',
    features: ['1 instruction', 'No accounts'],
    factory: 'ANCHOR_TEMPLATE',
  },
  {
    name: 'native-project',
    label: 'Hello World (Native)',
    description: 'Minimal native Solana program using entrypoint macro',
    difficulty: 'Beginner',
    features: ['No Anchor', 'Lightweight'],
    factory: 'NATIVE_TEMPLATE',
  },
  {
    name: 'spl-transfer',
    label: 'SPL Token Transfer',
    description: 'Create mint, mint tokens, send with memo via CPI',
    difficulty: 'Intermediate',
    features: ['CPI to Token Program', 'Memos', '3 instructions'],
    factory: 'SPL_TRANSFER_TEMPLATE',
  },
  {
    name: 'coinflip',
    label: 'Coin Flip Game',
    description: 'On-chain coin flip with PDA house, game accounts, and payouts',
    difficulty: 'Advanced',
    features: ['PDAs', 'RNG from slot', 'SOL transfers', '4 instructions'],
    factory: 'COINFLIP_TEMPLATE',
  },
]

interface Props {
  onSelect: (factoryName: string) => void
  onClose: () => void
}

export function TemplatePicker({ onSelect, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 24, maxWidth: 560,
        width: '90%', maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Choose a Template</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TEMPLATES.map(t => (
            <button
              key={t.name}
              onClick={() => onSelect(t.factory)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: 12, border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                textAlign: 'left', fontSize: 13, width: '100%',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <strong>{t.label}</strong>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{t.difficulty}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {t.features?.map(f => (
                  <span key={f} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>{f}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 12, width: '100%', fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
