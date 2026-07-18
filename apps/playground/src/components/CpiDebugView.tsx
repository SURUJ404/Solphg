import React, { useState } from 'react'

interface CpiNode {
  programId: string
  depth: number
  computeUnits?: string
  accounts: string[]
  success: boolean
  error?: string
  children: CpiNode[]
}

interface Props {
  cpiTree: CpiNode[]
  programId?: string
  rawLogs?: string
  summary?: { totalCpis: number; computeUnits: string }
  onClose: () => void
}

function CpiTreeNode({ node, depth }: { node: CpiNode; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const indent = depth * 16

  return (
    <div style={{ marginLeft: indent }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
          cursor: 'pointer', fontSize: 12,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ color: node.success ? 'var(--success)' : 'var(--error)', fontWeight: 'bold' }}>
          {node.children.length > 0 ? (expanded ? '▼' : '▶') : '·'}
        </span>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: node.success ? 'var(--success)' : 'var(--error)',
        }} />
        <code style={{ fontSize: 11, color: 'var(--accent)' }}>{node.programId.slice(0, 8)}..</code>
        <span style={{ color: 'var(--text-muted)' }}>
          {node.success ? '✓ success' : '✗ failed'}
        </span>
        {node.computeUnits && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>
            ({node.computeUnits} CU)
          </span>
        )}
      </div>

      {expanded && (
        <>
          {node.error && (
            <div style={{ marginLeft: 22, fontSize: 11, color: 'var(--error)', marginBottom: 4 }}>
              {node.error}
            </div>
          )}
          {node.children.map((child, i) => (
            <CpiTreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  )
}

export function CpiDebugView({ cpiTree, programId, rawLogs, summary, onClose }: Props) {
  const [showRaw, setShowRaw] = useState(false)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      marginTop: 8, fontSize: 12,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--bg-hover)',
      }}>
        <strong>CPI Trace {summary ? `(${summary.totalCpis} invocations)` : ''}</strong>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 10 }}>✕</button>
      </div>

      <div style={{ padding: '8px 12px' }}>
        {programId && (
          <div style={{ marginBottom: 8, fontSize: 10, color: 'var(--text-muted)' }}>
            Program: <code>{programId}</code>
          </div>
        )}

        {cpiTree.length === 0 ? (
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
            No CPI invocations detected. This program may not call other programs, or the transaction
            needs specific instruction data to trigger CPIs.
          </div>
        ) : (
          cpiTree.map((node, i) => (
            <CpiTreeNode key={i} node={node} depth={0} />
          ))
        )}

        {summary && (
          <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)' }}>
            <span>Total CPIs: <strong>{summary.totalCpis}</strong></span>
            <span>Compute: <strong>{summary.computeUnits}</strong></span>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowRaw(!showRaw)}
            style={{ fontSize: 10 }}
          >
            {showRaw ? 'Hide Raw Logs' : 'Show Raw Logs'}
          </button>
          {showRaw && rawLogs && (
            <pre style={{
              marginTop: 4, padding: 8, fontSize: 10, maxHeight: 200, overflow: 'auto',
              background: 'var(--bg)', borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {rawLogs}
            </pre>
          )}
        </div>

        <div style={{ marginTop: 8, padding: 6, background: 'var(--bg)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          💡 <strong>What is CPI?</strong> Cross-Program Invocation is how Solana programs call other programs.
          Each nested level represents a program calling another program. The tree shows the full call chain,
          compute units consumed, and whether each call succeeded.
        </div>
      </div>
    </div>
  )
}

// Standalone log parser — allows pasting raw simulation output
export function CpiLogParser() {
  const [logs, setLogs] = useState('')
  const [parsed, setParsed] = useState<CpiNode[] | null>(null)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, marginBottom: 4 }}>Paste raw simulation logs to parse CPI trace:</div>
      <textarea
        value={logs}
        onChange={e => setLogs(e.target.value)}
        rows={4}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: 6, fontFamily: 'monospace' }}
        placeholder="Paste solana simulate output here..."
      />
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => {
          // Simple parser (mirrors backend parseCpiLogs)
          const roots: CpiNode[] = []
          const stack: CpiNode[] = []
          for (const line of logs.split('\n')) {
            const invokeMatch = line.match(/Program\s+(\w+)\s+invoke\s+\[(\d+)\]/)
            if (invokeMatch) {
              const node: CpiNode = {
                programId: invokeMatch[1], depth: parseInt(invokeMatch[2]),
                accounts: [], success: false, children: [],
              }
              if (node.depth === 1) { roots.push(node); stack.length = 0; stack.push(node) }
              else if (stack.length > 0) { stack[stack.length - 1].children.push(node); stack.push(node) }
              continue
            }
            const cuMatch = line.match(/Program\s+\w+\s+consumed\s+(\d+)\s+of\s+(\d+)/)
            if (cuMatch && stack.length > 0) { stack[stack.length - 1].computeUnits = `${cuMatch[1]} / ${cuMatch[2]}`; continue }
            const resultMatch = line.match(/Program\s+\w+\s+(success|failed)/)
            if (resultMatch && stack.length > 0) { stack[stack.length - 1].success = resultMatch[1] === 'success'; stack.pop(); continue }
          }
          setParsed(roots)
        }}
        style={{ marginTop: 4, fontSize: 11 }}
      >
        Parse
      </button>
      {parsed && parsed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {parsed.map((node, i) => <CpiTreeNode key={i} node={node} depth={0} />)}
        </div>
      )}
      {parsed && parsed.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>No CPI invocations found in logs.</div>
      )}
    </div>
  )
}
