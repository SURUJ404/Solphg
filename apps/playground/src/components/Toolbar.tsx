import React from 'react'
import { CLUSTERS } from '@solshift/core'

interface Props {
  projectName: string
  onBuild: () => void
  onDeploy: () => void
  isBuilding: boolean
  apiConnected: boolean | undefined
  apiUrl: string
  cluster: string
  onClusterChange: (name: string) => void
}

export function Toolbar({ projectName, onBuild, onDeploy, isBuilding, apiConnected, apiUrl, cluster, onClusterChange }: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-brand">SolShift</span>
      <span className="toolbar-project">{projectName}</span>
      <div className="toolbar-spacer" />
      <div className="toolbar-actions">
        <select
          className="cluster-select"
          value={cluster}
          onChange={e => onClusterChange(e.target.value)}
          style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
        >
          {CLUSTERS.map(c => (
            <option key={c.name} value={c.name}>{c.label}</option>
          ))}
        </select>
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
