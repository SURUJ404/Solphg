import React, { useState, useEffect, useCallback, useRef } from 'react'
import { EditorPanel } from './components/EditorPanel.js'
import { TerminalPanel } from './components/TerminalPanel.js'
import { FileExplorer } from './components/FileExplorer.js'
import { WalletPanel } from './components/WalletPanel.js'
import { Toolbar } from './components/Toolbar.js'
import { ProjectManager, ANCHOR_TEMPLATE } from '@solshift/plugin-manager'
import { CompilerClient } from '@solshift/engine'
import { TerminalEmulator } from '@solshift/shell'
import type { SolpgProject, SolpgFile, TerminalLine, WalletState } from '@solshift/core'
import { loadWallet, saveWallet, clearWallet } from '@solshift/core'
import './styles.css'

const projectManager = new ProjectManager()
const compilerClient = new CompilerClient()

export function App() {
  const [project, setProject] = useState<SolpgProject | null>(null)
  const [activeFile, setActiveFile] = useState<SolpgFile | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [builtBytecode, setBuiltBytecode] = useState<string | null>(null)

  const terminalRef = useRef<TerminalEmulator | null>(null)
  const buildRef = useRef<() => Promise<void>>(async () => {})
  const deployRef = useRef<() => Promise<void>>(async () => {})

  const handleBuild = useCallback(async () => {
    if (!project) return
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Building ${project.name}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])

    const result = await compilerClient.build({
      programName: project.name,
      files: project.files.map(f => ({ path: f.path, content: f.content })),
    })

    if (result.success) {
      const progId = result.programId ? `\nProgram ID: ${result.programId}` : ''
      if (result.program) setBuiltBytecode(result.program)
      const done: TerminalLine = {
        id: crypto.randomUUID(),
        content: `Build complete.${progId}`,
        type: 'output',
      }
      setTerminalLines(prev => [...prev, done])
    } else {
      const err: TerminalLine = {
        id: crypto.randomUUID(),
        content: `Build failed:\n${result.error || result.logs || 'Unknown error'}`,
        type: 'error',
      }
      setTerminalLines(prev => [...prev, err])
    }
  }, [project])

  const handleDeploy = useCallback(async () => {
    if (!builtBytecode) {
      const msg: TerminalLine = { id: crypto.randomUUID(), content: 'No built program to deploy. Build first.', type: 'error' }
      setTerminalLines(prev => [...prev, msg])
      return
    }
    if (!wallet) {
      const msg: TerminalLine = { id: crypto.randomUUID(), content: 'Generate a wallet first.', type: 'error' }
      setTerminalLines(prev => [...prev, msg])
      return
    }

    const msg: TerminalLine = { id: crypto.randomUUID(), content: 'Deploying program to devnet...', type: 'system' }
    setTerminalLines(prev => [...prev, msg])

    const result = await compilerClient.deploy(builtBytecode, wallet.secretKey)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Deploy failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Deploy tx: ${result.signature}`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    }
  }, [builtBytecode, wallet])

  buildRef.current = handleBuild
  deployRef.current = handleDeploy

  useEffect(() => {
    const existing = projectManager.getAll()
    if (existing.length > 0) {
      setProject(existing[0])
      setActiveFile(existing[0].files[0] || null)
    } else {
      const p = projectManager.createFromTemplate(ANCHOR_TEMPLATE)
      setProject(p)
      setActiveFile(p.files[0] || null)
    }

    const stored = loadWallet()
    if (stored) setWallet(stored)

    const terminal = new TerminalEmulator(compilerClient)
    terminal.setWallet(stored)
    terminal.onBuild(() => buildRef.current())
    terminal.onDeploy(() => deployRef.current())
    terminalRef.current = terminal
  }, [])

  useEffect(() => {
    terminalRef.current?.setWallet(wallet)
  }, [wallet])

  const handleFileSelect = useCallback((file: SolpgFile) => {
    setActiveFile(file)
  }, [])

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!project || !activeFile || !value) return
    projectManager.updateFile(project.id, activeFile.path, value)
    setActiveFile(prev => prev ? { ...prev, content: value } : null)
  }, [project, activeFile])

  const handleCommand = useCallback(async (input: string) => {
    if (!terminalRef.current) return
    const newLines = await terminalRef.current.execute(input)
    setTerminalLines(prev => [...prev, ...newLines])
  }, [])

  const handleConnect = useCallback(async () => {
    const mod = await import('@solana/web3.js') as any
    const Keypair = mod.default?.Keypair ?? mod.Keypair
    const kp = Keypair.generate()
    const w: WalletState = {
      publicKey: kp.publicKey.toBase58(),
      secretKey: Buffer.from(kp.secretKey).toString('hex'),
      connected: true,
    }
    saveWallet(w)
    setWallet(w)
  }, [])

  const handleDisconnect = useCallback(() => {
    clearWallet()
    setWallet(null)
  }, [])

  return (
    <div className="app">
      <Toolbar
        projectName={project?.name || ''}
        onBuild={handleBuild}
        onDeploy={handleDeploy}
      />
      <div className="main-layout">
        <aside className="sidebar">
          <WalletPanel
            connected={!!wallet}
            publicKey={wallet?.publicKey ?? ''}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          <FileExplorer
            files={project?.files || []}
            activeFilePath={activeFile?.path || ''}
            onFileSelect={handleFileSelect}
          />
        </aside>
        <main className="content">
          <EditorPanel file={activeFile} onChange={handleEditorChange} />
          <TerminalPanel lines={terminalLines} onCommand={handleCommand} />
        </main>
      </div>
    </div>
  )
}
