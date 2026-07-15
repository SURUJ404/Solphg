import React, { useState, useEffect, useCallback, useRef } from 'react'
import { EditorPanel } from './components/EditorPanel.js'
import { TerminalPanel } from './components/TerminalPanel.js'
import { FileExplorer } from './components/FileExplorer.js'
import { WalletPanel } from './components/WalletPanel.js'
import { Toolbar } from './components/Toolbar.js'
import { ProjectManager, ANCHOR_TEMPLATE } from '@solshift/plugin-manager'
import { CompilerClient } from '@solshift/engine'
import { TerminalEmulator } from '@solshift/shell'
import { COMPILER_API_URL } from '@solshift/core'
import type { SolpgProject, SolpgFile, TerminalLine, WalletState } from '@solshift/core'
import { loadWallet, saveWallet, clearWallet } from '@solshift/core'
import { LandingPage } from './LandingPage.js'
import './styles.css'

const apiUrl = (import.meta as any)?.env?.VITE_COMPILER_API_URL || COMPILER_API_URL
const projectManager = new ProjectManager()
const compilerClient = new CompilerClient(apiUrl)

function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

export function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [project, setProject] = useState<SolpgProject | null>(null)
  const [activeFile, setActiveFile] = useState<SolpgFile | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [isAirdropping, setIsAirdropping] = useState(false)
  const [builtBytecode, setBuiltBytecode] = useState<string | null>(null)
  const [builtKeypair, setBuiltKeypair] = useState<string | undefined>(undefined)
  const [isBuilding, setIsBuilding] = useState(false)
  const [apiConnected, setApiConnected] = useState<boolean | undefined>(undefined)
  const [activeSidebar, setActiveSidebar] = useState<string>('files')

  const terminalRef = useRef<TerminalEmulator | null>(null)
  const buildRef = useRef<() => Promise<void>>(async () => {})
  const deployRef = useRef<() => Promise<void>>(async () => {})

  const handleBuild = useCallback(async () => {
    if (!project || isBuilding) return
    setIsBuilding(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Building ${project.name}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])

    // Only send .rs source files — API auto-generates Anchor.toml, Cargo.toml, etc.
    const sourceFiles = project.files
      .filter(f => f.path.endsWith('.rs'))
      .map(f => ({ path: f.path, content: f.content }))
    const result = await compilerClient.build({
      programName: project.name,
      files: sourceFiles,
    })

    if (result.success) {
      const progId = result.programId ? `\nProgram ID: ${result.programId}` : ''
      if (result.program) {
        setBuiltBytecode(result.program)
        setBuiltKeypair(result.programKeypair)
      }
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
    setIsBuilding(false)
  }, [project, isBuilding])

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

    const result = await compilerClient.deploy(builtBytecode, wallet.secretKey, builtKeypair)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Deploy failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Deploy tx: ${result.signature}`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    }
  }, [builtBytecode, wallet])

  const fetchBalance = useCallback(async (pubkey: string) => {
    const result = await compilerClient.getBalance(pubkey)
    if ('balance' in result) {
      setBalance(result.balance)
    }
  }, [])

  const handleAirdrop = useCallback(async () => {
    if (!wallet) return
    setIsAirdropping(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Airdropping 2 SOL to ${wallet.publicKey}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])
    const result = await compilerClient.airdrop(wallet.publicKey, 2)
    if (result.signature) {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Airdrop tx: ${result.signature}`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
      await fetchBalance(wallet.publicKey)
    } else {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Airdrop failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    }
    setIsAirdropping(false)
  }, [wallet, fetchBalance])

  const handleImport = useCallback(async (secretKeyHex: string) => {
    try {
      const mod = await import('@solana/web3.js') as any
      const Keypair = mod.default?.Keypair ?? mod.Keypair
      const secretBytes = new Uint8Array(secretKeyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
      const kp = Keypair.fromSecretKey(secretBytes)
      const w: WalletState = {
        publicKey: kp.publicKey.toBase58(),
        secretKey: secretKeyHex,
        connected: true,
      }
      saveWallet(w)
      setWallet(w)
      await fetchBalance(w.publicKey)
    } catch {
      const err: TerminalLine = { id: crypto.randomUUID(), content: 'Import failed: invalid secret key', type: 'error' }
      setTerminalLines(prev => [...prev, err])
    }
  }, [fetchBalance])

  buildRef.current = handleBuild
  deployRef.current = handleDeploy

  useEffect(() => {
    compilerClient.health().then(h => {
      setApiConnected(!('error' in h))
    })
  }, [])

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
    if (stored) {
      setWallet(stored)
      compilerClient.getBalance(stored.publicKey).then(r => {
        if ('balance' in r) setBalance(r.balance)
      })
    }

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
    setProject(prev => prev ? {
      ...prev,
      files: prev.files.map(f => f.path === activeFile.path ? { ...f, content: value } : f),
    } : null)
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
    await fetchBalance(w.publicKey)
  }, [fetchBalance])

  const handleDisconnect = useCallback(() => {
    clearWallet()
    setWallet(null)
  }, [])

  if (showLanding) {
    return <LandingPage onLaunch={() => setShowLanding(false)} />
  }

  return (
    <div className="app">
      <Toolbar
        projectName={project?.name || ''}
        onBuild={handleBuild}
        onDeploy={handleDeploy}
        isBuilding={isBuilding}
        apiConnected={apiConnected}
        apiUrl={apiUrl}
      />
      <div className="main-layout">
        <nav className="icon-sidebar">
          <button
            className={`icon-btn ${activeSidebar === 'files' ? 'active' : ''}`}
            onClick={() => setActiveSidebar(activeSidebar === 'files' ? '' : 'files')}
            title="File Explorer"
          >
            <FilesIcon />
          </button>
          <button
            className={`icon-btn ${activeSidebar === 'search' ? 'active' : ''}`}
            onClick={() => setActiveSidebar(activeSidebar === 'search' ? '' : 'search')}
            title="Search"
          >
            <SearchIcon />
          </button>
          <div className="icon-sidebar-spacer" />
          <div className="icon-sidebar-bottom">
            <button
              className={`icon-btn ${activeSidebar === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveSidebar(activeSidebar === 'settings' ? '' : 'settings')}
              title="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </nav>
        {activeSidebar && (
          <aside className="side-panel">
            <div className="side-panel-header">
              {activeSidebar === 'files' ? 'Explorer' : activeSidebar === 'search' ? 'Search' : 'Settings'}
            </div>
            <div className="side-panel-content">
              {activeSidebar === 'files' ? (
                <>
                  <FileExplorer
                    files={project?.files || []}
                    activeFilePath={activeFile?.path || ''}
                    onFileSelect={handleFileSelect}
                  />
                  <div className="wallet-section">
                    <div className="wallet-label">Wallet</div>
                    <WalletPanel
                      connected={!!wallet}
                      publicKey={wallet?.publicKey ?? ''}
                      secretKey={wallet?.secretKey ?? ''}
                      balance={balance}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      onAirdrop={handleAirdrop}
                      onImport={handleImport}
                      isAirdropping={isAirdropping}
                    />
                  </div>
                </>
              ) : activeSidebar === 'search' ? (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12 }}>
                  Search coming soon
                </div>
              ) : (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12 }}>
                  Settings coming soon
                </div>
              )}
            </div>
          </aside>
        )}
        <main className="content">
          <EditorPanel file={activeFile} onChange={handleEditorChange} />
          <TerminalPanel lines={terminalLines} onCommand={handleCommand} />
        </main>
      </div>
    </div>
  )
}
