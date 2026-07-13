import React, { useState, useRef, useEffect } from 'react'
import type { TerminalLine } from '@solshift/core'

interface Props {
  lines: TerminalLine[]
  onCommand: (input: string) => void
}

export function TerminalPanel({ lines, onCommand }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onCommand(input.trim())
    setInput('')
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">Terminal</div>
      <div className="terminal-output">
        {lines.map(line => (
          <div key={line.id} className={`terminal-line ${line.type}`}>
            {line.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="terminal-input-row" onSubmit={handleSubmit}>
        <span className="prompt">$</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a command..."
          spellCheck={false}
        />
      </form>
    </div>
  )
}
