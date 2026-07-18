import { COMPILER_API_URL } from '@solshift/core'

export interface BuildFile {
  path: string
  content: string
}

export interface BuildRequest {
  programName: string
  files: BuildFile[]
}

export interface BuildResult {
  success: boolean
  logs: string
  program?: string
  idl?: unknown
  programId?: string
  programKeypair?: string
  error?: string
}

export interface HealthStatus {
  status: string
  activeBuilds: number
  maxConcurrentBuilds: number
}

function resolveApiUrl(override?: string): string {
  if (override) return override
  try {
    const envUrl = (import.meta as Record<string, any>).env?.VITE_COMPILER_API_URL
    if (envUrl) return envUrl
  } catch {}
  return COMPILER_API_URL
}

export class CompilerClient {
  private apiUrl: string

  constructor(apiUrl?: string) {
    this.apiUrl = resolveApiUrl(apiUrl)
  }

  getUrl(): string {
    return this.apiUrl
  }

  async build(req: BuildRequest): Promise<BuildResult> {
    try {
      const res = await fetch(`${this.apiUrl}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) {
        const text = await res.text()
        return { success: false, logs: '', error: `API error ${res.status}: ${text}` }
      }
      return res.json() as Promise<BuildResult>
    } catch {
      return { success: false, logs: '', error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running (docker compose up).` }
    }
  }

  async health(): Promise<HealthStatus | { error: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/health`)
      return res.json()
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running (docker compose up).` }
    }
  }

  async deploy(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string): Promise<{ signature?: string; programId?: string; error?: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey, programKeypair, cluster }),
      })
      return res.json() as Promise<{ signature?: string; programId?: string; error?: string }>
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running.` }
    }
  }

  async simulate(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string): Promise<{
    success?: boolean; programId?: string; bytecodeSize?: number; estimatedRentSol?: number;
    authorityBalance?: number; hasSufficientBalance?: boolean; output?: string; error?: string
  }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey, programKeypair, cluster }),
      })
      return res.json()
    } catch {
      return { error: `Cannot reach build service.` }
    }
  }

  async airdrop(address: string, amount: number = 2, cluster?: string): Promise<{ signature?: string; error?: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/airdrop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount, cluster }),
      })
      return res.json() as Promise<{ signature?: string; error?: string }>
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Start it with: docker compose up` }
    }
  }

  async getBalance(address: string, cluster?: string): Promise<{ balance: number } | { error: string }> {
    try {
      const params = cluster ? `?cluster=${cluster}` : ''
      const res = await fetch(`${this.apiUrl}/api/balance/${address}${params}`)
      return res.json() as Promise<{ balance: number } | { error: string }>
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Start it with: docker compose up` }
    }
  }
}
