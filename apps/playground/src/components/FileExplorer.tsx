import React from 'react'
import type { SolpgFile } from '@solshift/core'

interface Props {
  files: SolpgFile[]
  activeFilePath: string
  onFileSelect: (file: SolpgFile) => void
}

export function FileExplorer({ files, activeFilePath, onFileSelect }: Props) {
  return (
    <div className="file-explorer">
      <div className="panel-title">Files</div>
      <div className="file-list">
        {files.map(file => (
          <div
            key={file.path}
            className={`file-item ${file.path === activeFilePath ? 'active' : ''}`}
            onClick={() => onFileSelect(file)}
          >
            <span className={`file-icon ${file.language}`} />
            {file.name}
          </div>
        ))}
      </div>
    </div>
  )
}
