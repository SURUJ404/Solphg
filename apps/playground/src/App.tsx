import React, { useState, useEffect, useCallback, useRef } from 'react'
import { EditorPanel } from './components/EditorPanel.js'
import { TerminalPanel } from './components/TerminalPanel.js'
import { FileExplorer } from './components/FileExplorer.js'
import { WalletPanel } from './components/WalletPanel.js'
import { DocsPanel } from './components/DocsPanel.js'
import { BuildResult } from './components/BuildResult.js'
import { Toolbar } from './components/Toolbar.js'
import { TemplatePicker } from './components/TemplatePicker.js'
import { AccountVisualizer } from './components/AccountVisualizer.js'
import { ProjectManager, ANCHOR_TEMPLATE, SPL_TRANSFER_TEMPLATE, COINFLIP_TEMPLATE, NATIVE_TEMPLATE } from '@solshift/plugin-manager'
import { CompilerClient } from '@solshift/engine'
import { TerminalEmulator } from '@solshift/shell'
import { COMPILER_API_URL, CLUSTERS, getCluster } from '@solshift/core'
import type { SolpgProject, SolpgFile, TerminalLine, WalletState, ClusterConfig } from '@solshift/core'
import { loadWallet, saveWallet, clearWallet } from '@solshift/core'
import { useBrowserWallet } from './useBrowserWallet.js'
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

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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
  const [buildResult, setBuildResult] = useState<{ success: boolean; programId?: string; bytecodeSize?: number; error?: string; logs?: string; timestamp: number } | null>(null)
  const [apiConnected, setApiConnected] = useState<boolean | undefined>(undefined)
  const [activeSidebar, setActiveSidebar] = useState<string>('files')
  const [cluster, setCluster] = useState<string>(() => localStorage.getItem('solpg_cluster') || 'devnet')
  const [simulation, setSimulation] = useState<{ success?: boolean; programId?: string; estimatedRentSol?: number; authorityBalance?: number; hasSufficientBalance?: boolean; output?: string; error?: string } | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [cpiData, setCpiData] = useState<{ cpiTree?: any[]; programId?: string; rawLogs?: string; summary?: any } | null>(null)
  const [isDebuggingCpi, setIsDebuggingCpi] = useState(false)
  const [profileData, setProfileData] = useState<any>(null)
  const [isProfiling, setIsProfiling] = useState(false)

  // Browser wallet integration (Phantom, Solflare, Backpack)
  const browserWallet = useBrowserWallet()

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
      setBuildResult({
        success: true,
        programId: result.programId,
        bytecodeSize: result.program ? (result.program.length * 3 / 4) : undefined,
        timestamp: Date.now(),
      })
    } else {
      const err: TerminalLine = {
        id: crypto.randomUUID(),
        content: `Build failed:\n${result.error || result.logs || 'Unknown error'}`,
        type: 'error',
      }
      setTerminalLines(prev => [...prev, err])
      setBuildResult({
        success: false,
        error: result.error || result.logs || 'Unknown error',
        timestamp: Date.now(),
      })
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
    if (!wallet.secretKey) {
      const msg: TerminalLine = { id: crypto.randomUUID(), content: 'Deploy requires a generated or imported wallet (browser wallets like Backpack cannot sign deployments). Generate a wallet in the Wallet panel.', type: 'error' }
      setTerminalLines(prev => [...prev, msg])
      return
    }

    const msg: TerminalLine = { id: crypto.randomUUID(), content: 'Deploying program to devnet...', type: 'system' }
    setTerminalLines(prev => [...prev, msg])

    const msg2: TerminalLine = { id: crypto.randomUUID(), content: `Deploying to ${cluster}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg2])
    const result = await compilerClient.deploy(builtBytecode, wallet.secretKey, builtKeypair, cluster)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Deploy failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Deploy tx: ${result.signature}`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    }
  }, [builtBytecode, wallet, cluster])

  const handleClusterChange = useCallback((name: string) => {
    setCluster(name)
    localStorage.setItem('solpg_cluster', name)
    if (wallet) {
      fetchBalance(wallet.publicKey, name)
    }
  }, [wallet])

  const handleSelectTemplate = useCallback((template: any) => {
    const p = projectManager.createFromTemplate(template)
    setProject(p)
    setActiveFile(p.files[0] || null)
    setShowTemplatePicker(false)
    setBuiltBytecode(null)
    setBuiltKeypair(undefined)
    setBuildResult(null)
    setSimulation(null)
  }, [])

  const handleSimulate = useCallback(async () => {
    if (!builtBytecode || !wallet || !wallet.secretKey) return
    setIsSimulating(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Simulating deploy on ${cluster}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])
    const result = await compilerClient.simulate(builtBytecode, wallet.secretKey, builtKeypair, cluster)
    setSimulation(result)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Simulation failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else if (result.success === false) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Simulation issues:\n${result.output}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Simulation OK — est. rent: ${result.estimatedRentSol} SOL, balance: ${result.authorityBalance} SOL`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    }
    setIsSimulating(false)
  }, [builtBytecode, wallet, builtKeypair, cluster])

  const handleDebugCpi = useCallback(async () => {
    if (!builtBytecode) return
    setIsDebuggingCpi(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Tracing CPI invocations...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])
    const result = await compilerClient.debugCpi(builtBytecode)
    setCpiData(result)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `CPI trace failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else if (result.cpiTree && result.cpiTree.length > 0) {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `CPI trace: ${result.summary?.totalCpis || 0} invocations found`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    } else {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `CPI trace complete — no cross-program invocations detected`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
    }
    setIsDebuggingCpi(false)
  }, [builtBytecode])

  const fetchBalance = useCallback(async (pubkey: string, clusterName?: string) => {
    const result = await compilerClient.getBalance(pubkey, clusterName || cluster)
    if ('balance' in result) {
      setBalance(result.balance)
    }
  }, [cluster])

  const handleAirdrop = useCallback(async () => {
    if (!wallet) return
    setIsAirdropping(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Airdropping 2 SOL to ${wallet.publicKey}...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])

    // 1) Try backend (faucet transfer + server-side RPC pool)
    const result = await compilerClient.airdrop(wallet.publicKey, 2)

    if (result.signature) {
      const done: TerminalLine = { id: crypto.randomUUID(), content: `Airdrop tx: ${result.signature}`, type: 'output' }
      setTerminalLines(prev => [...prev, done])
      await fetchBalance(wallet.publicKey)
    } else {
      // 2) Backend failed (faucet dry / RPCs rate-limited from Railway IP).
      //    Fall back to client-side requestAirdrop from the user's browser IP.
      const fallbackMsg: TerminalLine = { id: crypto.randomUUID(), content: `Backend busy, retrying from your browser...`, type: 'system' }
      setTerminalLines(prev => [...prev, fallbackMsg])

      let clientSig: string | null = null
      const clientRpcs = [
        'https://api.devnet.solana.com',
        'https://devnet.helius-rpc.com/?api-key=',
      ].sort(() => Math.random() - 0.5)

      for (const url of clientRpcs) {
        try {
          const mod = await import('@solana/web3.js') as any
          const rpc = mod.createSolanaRpc(url)
          clientSig = await rpc.requestAirdrop(wallet.publicKey, 2e9).send()
          if (clientSig) break
        } catch {}
      }

      if (clientSig) {
        const done: TerminalLine = { id: crypto.randomUUID(), content: `Airdrop tx: ${clientSig}`, type: 'output' }
        setTerminalLines(prev => [...prev, done])
        await fetchBalance(wallet.publicKey)
      } else {
        const err: TerminalLine = { id: crypto.randomUUID(), content: `Airdrop failed: ${result.error}`, type: 'error' }
        setTerminalLines(prev => [...prev, err])
      }
    }

    setIsAirdropping(false)
  }, [wallet, fetchBalance])

  const handleImport = useCallback(async (raw: string) => {
    try {
      const trimmed = raw.trim()
      if (!trimmed) {
        throw new Error('Input is empty')
      }

      let secretBytes: Uint8Array | null = null

      // Format 1: Hex string (128 hex chars)
      if (/^[0-9a-fA-F]+$/.test(trimmed)) {
        if (trimmed.length !== 128) {
          throw new Error(`Hex key must be 128 characters (64 bytes), got ${trimmed.length}`)
        }
        const bytes = new Uint8Array(128 / 2)
        for (let i = 0; i < 128; i += 2) {
          bytes[i / 2] = parseInt(trimmed.slice(i, i + 2), 16)
        }
        secretBytes = bytes
      }

      // Format 2: JSON array of numbers (Solana CLI format)
      if (!secretBytes && trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const arr = JSON.parse(trimmed)
          if (Array.isArray(arr) && arr.length === 64 && arr.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) {
            secretBytes = new Uint8Array(arr)
          }
        } catch {}
      }

      // Format 3: Base58 encoded secret key
      if (!secretBytes) {
        try {
          const { decode } = await import('bs58') as any
          const decoded = decode(trimmed)
          if (decoded.length === 64) {
            secretBytes = decoded
          }
        } catch {}
      }

      if (!secretBytes) {
        throw new Error('Unrecognised key format. Supported: 128-char hex, JSON array [12,45,...], or base58 private key')
      }

      const mod = await import('@solana/web3.js') as any
      const Keypair = mod.default?.Keypair ?? mod.Keypair
      const kp = Keypair.fromSecretKey(secretBytes)
      // Normalise to hex so deploy (which expects hex) works regardless of import format
      const secretHex = Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('')
      const w: WalletState = {
        publicKey: kp.publicKey.toBase58(),
        secretKey: secretHex,
        connected: true,
      }
      saveWallet(w)
      setWallet(w)
      await fetchBalance(w.publicKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid secret key'
      const line: TerminalLine = { id: crypto.randomUUID(), content: `Import failed: ${msg}`, type: 'error' }
      setTerminalLines(prev => [...prev, line])
    }
  }, [fetchBalance])

  const handleProfile = useCallback(async () => {
    if (!builtBytecode || !wallet || !wallet.secretKey) return
    setIsProfiling(true)
    const msg: TerminalLine = { id: crypto.randomUUID(), content: `Running CU profiler on local validator...`, type: 'system' }
    setTerminalLines(prev => [...prev, msg])
    const result = await compilerClient.profile(builtBytecode, wallet.secretKey, builtKeypair, undefined, cluster)
    setProfileData(result)
    if (result.error) {
      const err: TerminalLine = { id: crypto.randomUUID(), content: `Profile failed: ${result.error}`, type: 'error' }
      setTerminalLines(prev => [...prev, err])
    } else {
      const done: TerminalLine = {
        id: crypto.randomUUID(),
        content: `Profile complete — ${result.totalCuConsumed?.toLocaleString()} CU consumed (${result.cuUtilization}% of ${(result.cuCap || 1400000).toLocaleString()} cap)`,
        type: 'output',
      }
      setTerminalLines(prev => [...prev, done])
    }
    setIsProfiling(false)
  }, [builtBytecode, wallet, builtKeypair, cluster])

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

  // Open docs tab when URL has #docs
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#docs') {
        setActiveSidebar('docs')
      }
    }
    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
  }, [])

  // Sync browser wallet state
  useEffect(() => {
    if (browserWallet.connected && browserWallet.publicKey) {
      setWallet(prev => {
        if (prev && prev.secretKey) return prev
        return { publicKey: browserWallet.publicKey, secretKey: '', connected: true }
      })
    } else if (!browserWallet.connected && wallet?.secretKey === '') {
      setWallet(null)
    }
  }, [browserWallet.connected, browserWallet.publicKey])

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

  const handleDisconnect = useCallback(async () => {
    if (browserWallet.connected) {
      await browserWallet.disconnect()
    }
    clearWallet()
    setWallet(null)
  }, [browserWallet.connected, browserWallet.disconnect])

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
        cluster={cluster}
        onClusterChange={handleClusterChange}
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
          <button
            className={`icon-btn ${activeSidebar === 'docs' ? 'active' : ''}`}
            onClick={() => setActiveSidebar(activeSidebar === 'docs' ? '' : 'docs')}
            title="Docs"
          >
            <BookIcon />
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
                  <div style={{ padding: '8px 12px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowTemplatePicker(true)}
                      style={{ width: '100%', fontSize: 11 }}
                    >
                      + New from Template
                    </button>
                  </div>
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
                      browserWallets={browserWallet.wallets}
                      onBrowserWalletConnect={(name) => browserWallet.connect(name)}
                      onBrowserWalletDisconnect={() => browserWallet.disconnect()}
                    />
                  </div>
                </>
              ) : activeSidebar === 'search' ? (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12 }}>
                  Search coming soon
                </div>
              ) : activeSidebar === 'docs' ? (
                <DocsPanel />
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
          <BuildResult
            result={buildResult}
            onDeploy={handleDeploy}
            onSimulate={handleSimulate}
            hasWallet={!!wallet}
            hasSecretKey={!!wallet?.secretKey}
            simulation={simulation}
            isSimulating={isSimulating}
            cluster={cluster}
            cpiTree={cpiData?.cpiTree}
            cpiProgramId={cpiData?.programId}
            cpiRawLogs={cpiData?.rawLogs}
            cpiSummary={cpiData?.summary}
            onDebugCpi={builtBytecode ? handleDebugCpi : undefined}
            isDebuggingCpi={isDebuggingCpi}
            onProfile={builtBytecode ? handleProfile : undefined}
            isProfiling={isProfiling}
            profileData={profileData}
          />
          <TerminalPanel lines={terminalLines} onCommand={handleCommand} />
        </main>
      </div>
      {showTemplatePicker && (
        <TemplatePicker
          onSelect={(factory) => {
            const templates: Record<string, any> = {
              ANCHOR_TEMPLATE, SPL_TRANSFER_TEMPLATE, COINFLIP_TEMPLATE, NATIVE_TEMPLATE,
            }
            const t = templates[factory]
            if (t) handleSelectTemplate(t)
          }}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  )
}
