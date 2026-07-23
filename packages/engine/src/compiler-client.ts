import { COMPILER_API_URL } from '@solshift/core'

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout))
}

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
      const res = await fetchWithTimeout(`${this.apiUrl}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }, 320_000)
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
      const res = await fetchWithTimeout(`${this.apiUrl}/api/health`, {}, 15_000)
      return res.json()
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running (docker compose up).` }
    }
  }

  async deploy(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string): Promise<{ signature?: string; programId?: string; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${this.apiUrl}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey, programKeypair, cluster }),
      }, 130_000)
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
      const res = await fetchWithTimeout(`${this.apiUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey, programKeypair, cluster }),
      }, 30_000)
      return res.json()
    } catch {
      return { error: `Cannot reach build service.` }
    }
  }

  async debugCpi(bytecodeBase64: string, idl?: unknown): Promise<{
    success?: boolean; programId?: string; cpiTree?: any[]; rawLogs?: string; summary?: any; error?: string
  }> {
    try {
      const res = await fetchWithTimeout(`${this.apiUrl}/api/debug-cpi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, idl }),
      }, 30_000)
      return res.json()
    } catch {
      return { error: 'Cannot reach build service.' }
    }
  }

  async airdrop(address: string, amount: number = 2, cluster?: string): Promise<{ signature?: string; error?: string }> {
    try {
      const res = await fetchWithTimeout(`${this.apiUrl}/api/airdrop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount, cluster }),
      }, 30_000)
      return res.json() as Promise<{ signature?: string; error?: string }>
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Start it with: docker compose up` }
    }
  }

  async getBalance(address: string, cluster?: string): Promise<{ balance: number } | { error: string }> {
    try {
      const params = cluster ? `?cluster=${cluster}` : ''
      const res = await fetchWithTimeout(`${this.apiUrl}/api/balance/${encodeURIComponent(address)}${params}`, {}, 15_000)
      return res.json() as Promise<{ balance: number } | { error: string }>
    } catch {
      return { error: `Cannot reach build service at ${this.apiUrl}. Start it with: docker compose up` }
    }
  }

  async profile(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, instructionData?: string, cluster?: string): Promise<{
    success?: boolean; totalCuConsumed?: number; cuCap?: number; cuUtilization?: number;
    programId?: string; instructions?: any[]; error?: string; logs?: string[]
  }> {
    try {
      const res = await fetchWithTimeout(`${this.apiUrl}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey, programKeypair, instructionData, cluster }),
      }, 30_000)
      return res.json()
    } catch {
      return { error: 'Cannot reach build service.' }
    }
  }
}
