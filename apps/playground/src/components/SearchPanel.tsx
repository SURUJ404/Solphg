import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { SolpgFile } from '@solshift/core'

interface Props {
  files: SolpgFile[]
  onFileSelect: (file: SolpgFile) => void
}

interface FileMatch {
  type: 'file'
  file: SolpgFile
  line: number
  column: number
  content: string
  preview: string
}
interface KnowledgeMatch {
  type: 'program' | 'command' | 'concept' | 'template'
  label: string
  description: string
  details: string
  action?: () => void
}

type Result = FileMatch | KnowledgeMatch

const SOLANA_KNOWLEDGE: KnowledgeMatch[] = [
  // ── Program IDs ──
  { type: 'program', label: 'System Program', description: 'Built-in Solana program for chain-level operations', details: 'Address: 11111111111111111111111111111111\nManages accounts, transfers SOL, allocates space.' },
  { type: 'program', label: 'Token Program', description: 'SPL Token program for fungible tokens', details: 'Address: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA\nHandles token mint, transfer, burn, approve.' },
  { type: 'program', label: 'Associated Token Account Program', description: 'Derives deterministic token account addresses', details: 'Address: ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL\nCreates ATAs with a canonical seed.' },
  { type: 'program', label: 'BPF Loader (Upgradeable)', description: 'Loads and upgrades deployed programs', details: 'Address: BPFLoaderUpgradeab1e11111111111111111111111\nHandles program deployment, upgrades, and authority transfers.' },
  { type: 'program', label: 'Memo Program', description: 'Adds memos/notes to transactions', details: 'Address: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr\nOn-chain memo that explorers can display.' },
  { type: 'program', label: 'Stake Program', description: 'Manages staking and delegation', details: 'Address: StakeConfig11111111111111111111111111111111\nHandles stake account creation, delegation, deactivation.' },
  { type: 'program', label: 'Vote Program', description: 'Manages validator voting', details: 'Address: Vote111111111111111111111111111111111111111\nRecords validator votes and rewards.' },
  { type: 'program', label: 'Compute Budget Program', description: 'Sets transaction-level compute limits', details: 'Address: ComputeBudget111111111111111111111111111111\nUse setComputeUnitLimit and setComputeUnitPrice.' },
  { type: 'program', label: 'Bpf Loader', description: 'Original (non-upgradeable) BPF loader', details: 'Address: BPFLoader2111111111111111111111111111111111\nUsed for immutable deployed programs.' },
  { type: 'program', label: 'Ed25519 Program', description: 'Built-in Ed25519 signature verification', details: 'Address: Ed25519SigVerify111111111111111111111111111\nVerifies Ed25519 signatures on-chain.' },
  { type: 'program', label: 'Secp256k1 Program', description: 'Built-in ECDSA signature verification', details: 'Address: KeccakSecp256k11111111111111111111111111111\nVerifies Ethereum-style signatures on Solana.' },

  // ── CLI Commands ──
  { type: 'command', label: 'solana airdrop', description: 'Request devnet SOL to your wallet', details: 'Usage: solana airdrop [amount] [address]\nDefault amount: 2 SOL\nSource: backend faucet transfer (preferred) or RPC pool (fallback).' },
  { type: 'command', label: 'solana balance', description: 'Check wallet SOL balance', details: 'Usage: solana balance [address]\nShows balance in SOL with 4 decimal precision.' },
  { type: 'command', label: 'solana address', description: 'Display wallet public key', details: 'Usage: solana address\nShows the connected/selected wallet public key.' },
  { type: 'command', label: 'solana confirm', description: 'Wait for transaction confirmation', details: 'Usage: solana confirm <signature>\nPolls the cluster until the tx is confirmed or finalized.' },
  { type: 'command', label: 'solana config', description: 'View solana CLI configuration', details: 'Usage: solana config get\nShows current RPC URL, keypair path, and commitment.' },
  { type: 'command', label: 'solana deploy', description: 'Deploy a compiled program', details: 'Usage: solana program deploy <path> --program-id <keypair>\nUse the "Deploy" button in the Build Result panel.' },
  { type: 'command', label: 'anchor build', description: 'Build the Anchor project', details: 'Usage: anchor build\nCompiles Rust source to SBF bytecode. Use the "Build" button in the toolbar.' },
  { type: 'command', label: 'anchor deploy', description: 'Deploy compiled Anchor program', details: 'Usage: anchor deploy\nDeploys the built program to the selected cluster.' },
  { type: 'command', label: 'anchor test', description: 'Run Anchor tests', details: 'Usage: anchor test\nRuns TypeScript test files. Requires local validator in production.' },
  { type: 'command', label: 'help', description: 'Show available terminal commands', details: 'Lists all supported commands: solana airdrop, solana balance, solana address, anchor build, anchor deploy, clear.' },

  // ── Solana Concepts ──
  { type: 'concept', label: 'PDA (Program Derived Address)', description: 'Deterministic address derived from program ID + seeds', details: 'PDAs have no corresponding private key. Derived with findProgramAddress(seeds, programId).\nUsed for: escrows, vaults, user state, AMM pools.' },
  { type: 'concept', label: 'CPI (Cross-Program Invocation)', description: 'One program calling another program\'s instruction', details: 'CPI enables composability — programs can invoke Token Program, System Program, etc.\nUse anchor_lang::solana_program::program::invoke().' },
  { type: 'concept', label: 'Rent & Rent-Exemption', description: 'Accounts must hold minimum SOL to stay on-chain', details: 'Rent-exempt ≈ 0.0035 SOL per KB.\nAccounts below minimum are purged. Use Rent::get()?.minimum_balance(size).' },
  { type: 'concept', label: 'SBF (Solana Bytecode Format)', description: 'Compiled program binary format for Solana VM', details: 'Replaced BPF. Compiled with cargo build-sbf.\nOutput: .so file deployable via solana program deploy.' },
  { type: 'concept', label: 'Account Model / Seeds', description: 'Solana accounts are declared upfront with seeds', details: 'Each account has: address, lamports, owner, data, executable.\nSeeds deterministically derive PDA addresses: [b"seed", user.key().as_ref()].' },
  { type: 'concept', label: 'Compute Units (CU)', description: 'Transaction execution budget', details: 'Default cap: 200,000 CU per instruction, 1.4M per tx.\nUse computeBudget program to adjust. Use the CU Profiler to find hotspots.' },
  { type: 'concept', label: 'Transaction Structure', description: 'How Solana transactions work', details: 'Contains: signatures, message (header + accounts + instructions + recent blockhash).\nAll accounts listed upfront → enables parallel execution.' },
  { type: 'concept', label: 'Anchor Framework', description: 'The standard Solana development framework', details: 'Version: 0.30.1\nUses #[program], #[derive(Accounts)], #[account] macros.\nHandles serialization, IDL generation, PDA bumps.' },
  { type: 'concept', label: 'Solana CLI Keypairs', description: 'Keypair file formats and management', details: 'JSON array of 64 bytes (Solana CLI format).\nAlso supports hex (128 chars) and base58.\nStored XOR-encrypted in localStorage.' },
  { type: 'concept', label: 'Program Upgrade Authority', description: 'Controls who can upgrade a deployed program', details: 'The deploying keypair owns the upgrade authority.\nThe Buffer account holds program data during upgrade.\nCan be transferred to another keypair.' },
  { type: 'concept', label: 'IDL (Interface Description Language)', description: 'JSON description of Anchor program interface', details: 'Auto-generated during build. Contains: instructions, accounts, types, errors.\nUsed by client SDKs to construct typed transactions.' },
  { type: 'concept', label: 'Solana Devnet Faucet', description: 'Get free SOL for testing', details: 'URL: https://faucet.solana.com\nAlso via: solana airdrop command (up to 2 SOL per request).\nFaucet wallet: 3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR' },

  // ── Project Templates ──
  { type: 'template', label: 'Anchor Counter Template', description: 'Minimal Anchor program with initialize instruction', details: 'Contains: lib.rs with Initialize accounts struct.\nFramework: anchor. One instruction. No CPI targets.' },
  { type: 'template', label: 'SPL Transfer Template', description: 'SPL token mint, mint-to, and transfer with memo', details: 'Contains: create_mint, mint_to, send_with_memo.\nUses anchor-spl and CPI to Token Program + Memo Program.' },
  { type: 'template', label: 'Coin Flip Template', description: 'On-chain coin flip game with house and game PDAs', details: 'Players bet SOL, house derives randomness from slot XOR blockhash.\nContains: initialize_house, play, settle instructions.' },
  { type: 'template', label: 'Native Solana Template', description: 'Simple native (non-Anchor) Solana program', details: 'Uses solana_program crate directly.\nentrypoint!(process_instruction) pattern.\nNo Anchor macros or IDL generation.' },
]

export function SearchPanel({ files, onFileSelect }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const fileResults = useMemo<FileMatch[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const matches: FileMatch[] = []
    for (const f of files) {
      const lines = f.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const col = lines[i].toLowerCase().indexOf(q)
        if (col !== -1) {
          const start = Math.max(0, col - 20)
          const end = Math.min(lines[i].length, col + q.length + 40)
          const preview = (start > 0 ? '...' : '') + lines[i].slice(start, end) + (end < lines[i].length ? '...' : '')
          matches.push({ type: 'file', file: f, line: i + 1, column: col + 1, content: lines[i], preview })
        }
      }
    }
    return matches
  }, [query, files])
  const knowledgeResults = useMemo<KnowledgeMatch[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return SOLANA_KNOWLEDGE.filter(k =>
      k.label.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q) ||
      k.details.toLowerCase().includes(q)
    )
  }, [query])

  const results = useMemo<Result[]>(() => {
    return [...knowledgeResults, ...fileResults]
  }, [knowledgeResults, fileResults])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[activeIndex]) {
      const r = results[activeIndex]
      if (r.type === 'file') onFileSelect((r as FileMatch).file)
    }
  }

  const badgeStyle = (type: string): React.CSSProperties => {
    const colors: Record<string, string> = {
      program: '#4ec9b0',
      command: '#569cd6',
      concept: '#dcdcaa',
      template: '#c586c0',
      file: '#6e6e6e',
    }
    return {
      display: 'inline-block', fontSize: 9, padding: '1px 5px', borderRadius: 3,
      background: colors[type] || '#6e6e6e', color: '#000', fontWeight: 600,
      textTransform: 'uppercase' as const, letterSpacing: '0.3px', marginRight: 6,
    }
  }

  return (
    <div className="search-panel">
      <div style={{ padding: '8px 12px' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files, programs, concepts..."
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px',
            background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)',
            borderRadius: 3, outline: 'none', fontFamily: 'var(--font-mono)',
          }}
        />
      </div>
      <div className="search-results">
        {query.trim() && results.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No results found
          </div>
        )}
        {!query.trim() && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            Search files, Solana programs, CLI commands, and concepts
          </div>
        )}
        {results.map((result, i) => (
          <div
            key={`${result.type}-${i}`}
            onClick={() => { if (result.type === 'file') onFileSelect((result as FileMatch).file) }}
            onMouseEnter={() => setActiveIndex(i)}
            style={{
              padding: '5px 12px', cursor: result.type === 'file' ? 'pointer' : 'default',
              fontSize: 12, background: i === activeIndex ? 'var(--bg-active)' : 'transparent',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <span style={badgeStyle(result.type)}>{result.type}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>
                {result.type === 'file' ? (result as FileMatch).file.name : (result as KnowledgeMatch).label}
              </span>
            </div>
            {result.type === 'file' ? (
              (() => {
                const m = result as FileMatch
                return <>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 2 }}>
                    {m.file.name}:{m.line}:{m.column}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.preview.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, j) =>
                      part.toLowerCase() === query.toLowerCase()
                        ? <span key={j} style={{ background: 'var(--accent)', color: '#fff', borderRadius: 2 }}>{part}</span>
                        : <span key={j}>{part}</span>
                    )}
                  </div>
                </>
              })()
            ) : (
              (() => {
                const k = result as KnowledgeMatch
                return <>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 2 }}>
                    {k.description}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {k.details}
                  </div>
                </>
              })()
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
