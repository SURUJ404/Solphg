import React from 'react'

interface BuildResultData {
  success: boolean
  programId?: string
  bytecodeSize?: number
  error?: string
  logs?: string
  timestamp: number
}

interface Props {
  result: BuildResultData | null
  onDeploy: () => void
  hasWallet: boolean
}

export function BuildResult({ result, onDeploy, hasWallet }: Props) {
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
            {hasWallet && (
              <button className="btn btn-primary btn-sm" onClick={onDeploy} style={{ marginTop: 8 }}>
                Deploy Program
              </button>
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
