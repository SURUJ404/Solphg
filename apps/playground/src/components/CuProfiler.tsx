import React, { useState } from 'react'

interface CuProfilerNode {
  programId: string
  cuConsumed: number
  ownCu: number
  depth: number
  success: boolean
  error?: string
  percentage: number
  isHotspot: boolean
  children: CuProfilerNode[]
}

interface CuProfilerData {
  totalCuConsumed?: number
  cuCap?: number
  cuUtilization?: number
  programId?: string
  instructions?: CuProfilerNode[]
  error?: string
  logs?: string[]
}

const KNOWN_PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
  'BPFLoaderUpgradeab1e11111111111111111111111': 'BPF Upgradeable Loader',
  'BPFLoader2111111111111111111111111111111111': 'BPF Loader v2',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'Vote111111111111111111111111111111111111111': 'Vote Program',
  'Stake11111111111111111111111111111111111111': 'Stake Program',
  'Config1111111111111111111111111111111111111': 'Config Program',
}

function shortenPk(pk: string): string {
  if (KNOWN_PROGRAMS[pk]) return KNOWN_PROGRAMS[pk]
  if (pk.length <= 12) return pk
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`
}

function fmtCu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

const HOTSPOT_THRESHOLD = 20

function getBarColor(pct: number, depth: number): string {
  if (pct > 50) return 'var(--error)'
  if (pct > HOTSPOT_THRESHOLD) return '#d29922'
  const hue = 200 + depth * 25
  const lightness = Math.max(30, 55 - depth * 6)
  return `hsl(${hue}, 40%, ${lightness}%)`
}

function InstructionBar({
  node,
  totalCu,
  depth,
  maxDepth,
}: {
  node: CuProfilerNode
  totalCu: number
  depth: number
  maxDepth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const pct = node.percentage
  const barPct = totalCu > 0 ? Math.max(0.5, (node.cuConsumed / totalCu) * 100) : 0
  const hasChildren = node.children.length > 0
  const indent = depth * 12

  return (
    <div className="cu-profiler-row">
      <div
        className={`cu-profiler-bar-wrap ${hasChildren ? 'cu-has-children' : ''}`}
        style={{ paddingLeft: indent }}
      >
        <div
          className="cu-profiler-bar"
          style={{
            width: `${barPct}%`,
            background: getBarColor(pct, depth),
          }}
        />
        <div className="cu-profiler-bar-label" onClick={() => hasChildren && setExpanded(!expanded)}>
          {hasChildren && <span className="cu-profiler-toggle">{expanded ? '▾' : '▸'}</span>}
          <span className="cu-profiler-prog">
            {shortenPk(node.programId)}
            {node.percentage > HOTSPOT_THRESHOLD && <span className="cu-profiler-hotspot-badge" title={`${pct}% of total CU — potential hotspot`}>!</span>}
          </span>
          <span className="cu-profiler-cu">{fmtCu(node.cuConsumed)}</span>
          <span className="cu-profiler-pct">{pct.toFixed(1)}%</span>
          {!node.success && <span className="cu-profiler-fail">FAIL</span>}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="cu-profiler-children">
          {node.children.map((child, i) => (
            <InstructionBar
              key={`${child.programId}-${i}`}
              node={child}
              totalCu={totalCu}
              depth={depth + 1}
              maxDepth={maxDepth}
            />
          ))}
          {node.ownCu > 0 && depth === 0 && (
            <div className="cu-profiler-row">
              <div className="cu-profiler-bar-wrap" style={{ paddingLeft: indent + 12 }}>
                <div className="cu-profiler-bar" style={{
                  width: `${Math.max(0.5, (node.ownCu / totalCu) * 100)}%`,
                  background: `hsl(140, 35%, 35%)`,
                }} />
                <div className="cu-profiler-bar-label">
                  <span className="cu-profiler-prog">(program logic)</span>
                  <span className="cu-profiler-cu">{fmtCu(node.ownCu)}</span>
                  <span className="cu-profiler-pct">{((node.ownCu / totalCu) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CuProfiler({ data, onClose }: { data: CuProfilerData; onClose: () => void }) {
  if (data.error) {
    return (
      <div className="cu-profiler">
        <div className="cu-profiler-header">
          <span>CU Profiler</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="cu-profiler-body">
          <div className="cu-profiler-error">{data.error}</div>
        </div>
      </div>
    )
  }

  const totalCu = data.totalCuConsumed || 0
  const cuCap = data.cuCap || 1_400_000
  const pct = data.cuUtilization || (cuCap > 0 ? (totalCu / cuCap) * 100 : 0)
  const isNearCap = pct > 80
  const isOverCap = totalCu > cuCap

  return (
    <div className="cu-profiler">
      <div className="cu-profiler-header">
        <span>CU Profiler</span>
        <span className="cu-profiler-prog-id">{data.programId ? shortenPk(data.programId) : ''}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      <div className="cu-profiler-body">
        {/* Summary bar */}
        <div className="cu-profiler-summary">
          <div className="cu-profiler-metric">
            <span className="cu-profiler-metric-label">Total CU</span>
            <span className={`cu-profiler-metric-value ${isOverCap ? 'cu-over' : isNearCap ? 'cu-warn' : ''}`}>
              {fmtCu(totalCu)}
            </span>
          </div>
          <div className="cu-profiler-metric">
            <span className="cu-profiler-metric-label">CU Cap</span>
            <span className="cu-profiler-metric-value">{fmtCu(cuCap)}</span>
          </div>
          <div className="cu-profiler-metric">
            <span className="cu-profiler-metric-label">Utilization</span>
            <span className={`cu-profiler-metric-value ${pct > 80 ? 'cu-warn' : ''}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="cu-profiler-metric">
            <span className="cu-profiler-metric-label">Instructions</span>
            <span className="cu-profiler-metric-value">{data.instructions?.length || 0}</span>
          </div>
        </div>

        {/* CU cap reference bar */}
        <div className="cu-profiler-cap-bar">
          <div className="cu-profiler-cap-bar-bg">
            <div
              className={`cu-profiler-cap-fill ${isOverCap ? 'cu-over' : isNearCap ? 'cu-warn' : ''}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
            <div className="cu-profiler-cap-line" style={{ left: `80%` }} />
          </div>
          <div className="cu-profiler-cap-labels">
            <span>0</span>
            <span style={{ left: '80%' }} className="cu-profiler-cap-label-80">80%</span>
            <span>{fmtCu(cuCap)}</span>
          </div>
        </div>

        {/* Flamechart / icicle chart */}
        {data.instructions && data.instructions.length > 0 && (
          <div className="cu-profiler-tree">
            <div className="cu-profiler-tree-header">
              <span>Instruction</span>
              <span>CU</span>
              <span>%</span>
            </div>
            {data.instructions.map((node, i) => (
              <InstructionBar
                key={`${node.programId}-${i}`}
                node={node}
                totalCu={totalCu}
                depth={0}
                maxDepth={4}
              />
            ))}
          </div>
        )}

        {(!data.instructions || data.instructions.length === 0) && (
          <div className="cu-profiler-empty">No instruction invocations detected during simulation.</div>
        )}

        {data.instructions && data.instructions.length > 0 && data.instructions.some((n: CuProfilerNode) => n.isHotspot) && (
          <div className="cu-profiler-hotspots">
            <div className="cu-profiler-hotspots-title">Hotspots (&gt;{HOTSPOT_THRESHOLD}% of total CU)</div>
            {data.instructions
              .filter((n: CuProfilerNode) => n.isHotspot)
              .flatMap((n: CuProfilerNode) => [n, ...n.children.filter((c: CuProfilerNode) => c.isHotspot)])
              .filter((n: CuProfilerNode) => n.isHotspot)
              .map((n, i) => (
                <div key={i} className="cu-profiler-hotspot-item">
                  <span className="cu-profiler-hotspot-prog">{shortenPk(n.programId)}</span>
                  <span className="cu-profiler-hotspot-cu">{fmtCu(n.cuConsumed)} ({n.percentage.toFixed(1)}%)</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}