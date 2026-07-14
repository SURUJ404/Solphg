import React from 'react'
import type { SolpgFile } from '@solshift/core'

interface Props {
  files: SolpgFile[]
  activeFilePath: string
  onFileSelect: (file: SolpgFile) => void
}

const languageIcons: Record<string, string> = {
  rust: '🦀',
  typescript: 'TS',
  json: '{}',
  plain: '·',
}

export function FileExplorer({ files, activeFilePath, onFileSelect }: Props) {
  return (
    <div className="file-tree">
      {files.map(file => (
        <div
          key={file.path}
          className={`file-item ${file.path === activeFilePath ? 'active' : ''}`}
          onClick={() => onFileSelect(file)}
        >
          <span className="icon">{languageIcons[file.language] || '·'}</span>
          <span>{file.name}</span>
        </div>
      ))}
    </div>
  )
}
