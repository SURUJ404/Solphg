import React, { useState } from 'react'
import { AccountVisualizer } from './AccountVisualizer.js'
import { CpiDebugView, CpiLogParser } from './CpiDebugView.js'

interface BuildResultData {
  success: boolean
  programId?: string
  bytecodeSize?: number
  error?: string
  logs?: string
  timestamp: number
}

interface SimResult {
  success?: boolean
  programId?: string
  estimatedRentSol?: number
  authorityBalance?: number
  hasSufficientBalance?: boolean
  output?: string
  error?: string
}

interface Props {
  result: BuildResultData | null
  onDeploy: () => void
  onSimulate: () => void
  hasWallet: boolean
  hasSecretKey: boolean
  simulation: SimResult | null
  isSimulating: boolean
  cluster: string
  cpiTree?: any[]
  cpiProgramId?: string
  cpiRawLogs?: string
  cpiSummary?: any
  onDebugCpi?: () => void
  isDebuggingCpi?: boolean
}

export function BuildResult({ result, onDeploy, onSimulate, hasWallet, hasSecretKey, simulation, isSimulating, cluster, cpiTree, cpiProgramId, cpiRawLogs, cpiSummary, onDebugCpi, isDebuggingCpi }: Props) {
  const [showVisualizer, setShowVisualizer] = useState(false)
  if (!result) return null

  return (
    <div className={`build-result ${result.success ? 'success' : 'error'}`}>
      <div className="build-result-header">
        <span className="build-result-status">
          {result.success ? '✓ Build Successful' : '✗ Build Failed'}
        </span>
        <span className="build-result-time">
          {new Date(result.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="build-result-body">
        {result.success ? (
          <>
            <div className="build-result-row">
              <span className="build-result-label">Program ID</span>
              <code className="build-result-value">{result.programId || 'N/A'}</code>
            </div>
            <div className="build-result-row">
              <span className="build-result-label">Bytecode</span>
              <span className="build-result-value">{result.bytecodeSize ? `${(result.bytecodeSize / 1024).toFixed(1)} KB` : 'N/A'}</span>
            </div>
            <div className="build-result-row" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <span className="build-result-label">Cluster</span>
              <span className="build-result-value">{cluster}</span>
            </div>

            {/* Simulation result */}
            {simulation && (
              <div className={`sim-result ${simulation.hasSufficientBalance ? 'ok' : 'warn'}`} style={{ marginTop: 8, padding: 8, background: 'var(--bg-surface)', borderRadius: 6, fontSize: 11 }}>
                {simulation.error ? (
                  <div style={{ color: 'var(--error)' }}>Simulation: {simulation.error}</div>
                ) : simulation.success === false ? (
                  <div style={{ color: 'var(--error)' }}>Simulation issues found — review before deploy</div>
                ) : (
                  <>
                    <div>✓ Simulation passed</div>
                    <div>Est. rent: <strong>{simulation.estimatedRentSol?.toFixed(3)} SOL</strong></div>
                    <div>Authority balance: <strong>{simulation.authorityBalance?.toFixed(3)} SOL</strong></div>
                    {!simulation.hasSufficientBalance && (
                      <div style={{ color: 'var(--error)', marginTop: 4 }}>⚠ Insufficient balance for rent</div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {hasWallet && hasSecretKey && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={onSimulate} disabled={isSimulating} style={{ fontSize: 11 }}>
                    {isSimulating ? 'Simulating...' : 'Simulate Deploy'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={onDeploy} disabled={simulation?.hasSufficientBalance === false}>
                    Deploy to {cluster}
                  </button>
                </>
              )}
              {result.programId && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowVisualizer(!showVisualizer)} style={{ fontSize: 11 }}>
                  {showVisualizer ? 'Hide Accounts' : 'View Accounts'}
                </button>
              )}
              {onDebugCpi && (
                <button className="btn btn-ghost btn-sm" onClick={onDebugCpi} disabled={isDebuggingCpi} style={{ fontSize: 11 }}>
                  {isDebuggingCpi ? 'Tracing CPIs...' : 'Trace CPI'}
                </button>
              )}
            </div>

            {showVisualizer && result.programId && (
              <AccountVisualizer programId={result.programId} cluster={cluster} />
            )}

            {cpiTree !== undefined && (
              <CpiDebugView
                cpiTree={cpiTree}
                programId={cpiProgramId}
                rawLogs={cpiRawLogs}
                summary={cpiSummary}
                onClose={() => {}}
              />
            )}
          </>
        ) : (
          <div className="build-result-error">
            {result.error || 'Unknown error'}
          </div>
        )}
      </div>
    </div>
  )
}
