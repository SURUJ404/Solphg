import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { SolpgFile } from '@solshift/core'

interface Props {
  files: SolpgFile[]
  onFileSelect: (file: SolpgFile) => void
}

interface Match {
  file: SolpgFile
  line: number
  column: number
  content: string
  preview: string
}

export function SearchPanel({ files, onFileSelect }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const results = useMemo<Match[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const matches: Match[] = []
    for (const f of files) {
      const lines = f.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const col = lines[i].toLowerCase().indexOf(q)
        if (col !== -1) {
          const start = Math.max(0, col - 20)
          const end = Math.min(lines[i].length, col + q.length + 40)
          const preview = (start > 0 ? '...' : '') + lines[i].slice(start, end) + (end < lines[i].length ? '...' : '')
          matches.push({ file: f, line: i + 1, column: col + 1, content: lines[i], preview })
        }
      }
    }
    return matches
  }, [query, files])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[activeIndex]) {
      onFileSelect(results[activeIndex].file)
    }
  }

  return (
    <div className="search-panel">
      <div style={{ padding: '8px 12px' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search file contents..."
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px',
            background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)',
            borderRadius: 3, outline: 'none', fontFamily: 'var(--font-mono)',
          }}
        />
      </div>
      <div className="search-results">
        {query.trim() && results.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No results found
          </div>
        )}
        {!query.trim() && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            Type to search across {files.length} file{files.length !== 1 ? 's' : ''}
          </div>
        )}
        {results.map((match, i) => (
          <div
            key={`${match.file.path}:${match.line}:${match.column}`}
            className={`search-result-item ${i === activeIndex ? 'active' : ''}`}
            onClick={() => onFileSelect(match.file)}
            onMouseEnter={() => setActiveIndex(i)}
            style={{
              padding: '4px 12px', cursor: 'pointer', fontSize: 12,
              background: i === activeIndex ? 'var(--bg-active)' : 'transparent',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 2 }}>
              {match.file.name}:{match.line}:{match.column}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {match.preview.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, j) =>
                part.toLowerCase() === query.toLowerCase()
                  ? <span key={j} style={{ background: 'var(--accent)', color: '#fff', borderRadius: 2 }}>{part}</span>
                  : <span key={j}>{part}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
