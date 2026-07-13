import React from 'react'

interface Props {
  projectName: string
  onBuild: () => void
  onDeploy: () => void
}

export function Toolbar({ projectName, onBuild, onDeploy }: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">Solana ⚡ Playground</div>
      <div className="toolbar-project">{projectName}</div>
      <div className="toolbar-actions">
        <button className="btn btn-secondary" onClick={onBuild}>
          Build
        </button>
        <button className="btn btn-primary" onClick={onDeploy}>
          Deploy
        </button>
      </div>
    </div>
  )
}
