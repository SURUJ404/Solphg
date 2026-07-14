import React from 'react'

interface Props {
  projectName: string
  onBuild: () => void
  onDeploy: () => void
  isBuilding: boolean
  apiConnected: boolean | undefined
  apiUrl: string
}

export function Toolbar({ projectName, onBuild, onDeploy, isBuilding, apiConnected, apiUrl }: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-brand">SolShift</span>
      <span className="toolbar-project">{projectName}</span>
      <div className="toolbar-spacer" />
      <div className="toolbar-actions">
        <button className="btn btn-primary" onClick={onBuild} disabled={isBuilding}>
          {isBuilding ? 'Building...' : 'Build'}
        </button>
        <button className="btn btn-secondary" onClick={onDeploy}>
          Deploy
        </button>
      </div>
      <div className="toolbar-status" title={apiUrl}>
        <span className={`status-dot status-${apiConnected === undefined ? 'unknown' : apiConnected ? 'ok' : 'err'}`} />
        API
      </div>
    </div>
  )
}
