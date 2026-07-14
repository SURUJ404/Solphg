import React from 'react'
import Editor from '@monaco-editor/react'
import type { SolpgFile } from '@solshift/core'

interface Props {
  file: SolpgFile | null
  onChange: (value: string | undefined) => void
}

const languageMap: Record<string, string> = {
  rust: 'rust',
  typescript: 'typescript',
  json: 'json',
  plain: 'plaintext',
}

export function EditorPanel({ file, onChange }: Props) {
  if (!file) {
    return <div className="editor-panel empty">Select a file to edit</div>
  }

  return (
    <div className="editor-panel">
      <div className="editor-tabs">
        <div className="editor-tab active">
          <span className="tab-icon">·</span>
          {file.name}
        </div>
      </div>
      <Editor
        height="100%"
        language={languageMap[file.language] || 'plaintext'}
        value={file.content}
        onChange={onChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 },
        }}
      />
    </div>
  )
}
