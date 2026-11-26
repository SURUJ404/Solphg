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

export interface ApiError {
  error: string
  code?: string
}

export interface BuildResult {
  success: boolean
  logs: string
  program?: string
  idl?: unknown
  programId?: string
  programKeypair?: string
  cached?: boolean
  cacheKey?: string
  durationMs?: number
  error?: string
  code?: string
}

export interface HealthStatus {
  status: string
  activeBuilds: number
  maxConcurrentBuilds: number
  queueDepth?: number
  cache?: { entries: number; maxEntries: number }
  toolchain?: Record<string, string>
}

export interface RustDiagnostic {
  file: string
  line: number
  column: number
  message: string
}

const RETRYABLE_CODES = new Set(['BUILD_QUEUE_FULL', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'OPS_BUSY'])

/** Parse rustc-style `path:line:col: error: message` lines into editor markers. */
export function parseRustDiagnostics(logs: string): RustDiagnostic[] {
  const out: RustDiagnostic[] = []
  const lines = logs.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(.+?):(\d+):(\d+):\s*(error(?:\[[^\]]+\])?|warning):\s*(.+)$/)
    if (!match) continue
    const severity = match[4].startsWith('warning') ? 'warning' : 'error'
    if (severity !== 'error') continue
    out.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[5].slice(0, 300),
    })
  }
  return out.slice(0, 50)
}

function resolveApiUrl(override?: string): string {
  if (override) return override
  try {
    const envUrl = (import.meta as Record<string, any>).env?.VITE_COMPILER_API_URL
    if (envUrl) return envUrl
  } catch {}
  return COMPILER_API_URL
}

function actionableError(status: number, code: string | undefined, raw: string): string {
  switch (code) {
    case 'BUILD_QUEUE_FULL':
      return 'All compiler workers are busy. Your build will retry automatically in a few seconds.'
    case 'BUILD_TIMEOUT':
      return 'The build exceeded the server time limit. Try a smaller program or fewer files.'
    case 'RATE_LIMITED':
    case 'QUOTA_EXCEEDED':
      return 'Too many requests from this network. Wait a moment and try again.'
    case 'INVALID_REQUEST':
      return `The build request was rejected: ${raw.slice(0, 200)}`
    case 'MAINNET_CONFIRMATION_REQUIRED':
      return 'Confirm the network, authority and estimated cost before deploying to mainnet.'
    default:
      break
  }
  if (status === 504) return 'The compiler timed out. Reduce the source size and try again.'
  if (status === 429) return 'The service is busy or rate-limited. Retrying shortly.'
  if (status >= 500) return 'The build service is temporarily unavailable. Try again in a minute.'
  return raw.slice(0, 300) || `Request failed with status ${status}`
}

interface PostOptions {
  path: string
  body: unknown
  timeoutMs: number
  maxRetries?: number
}

async function postJson<T>(base: string, options: PostOptions): Promise<T | ApiError> {
  const { path, body, timeoutMs, maxRetries = 2 } = options
  let lastStatus = 0
  let lastCode: string | undefined
  let lastRaw = ''

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response
    try {
      res = await fetchWithTimeout(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs)
    } catch {
      return { error: `Cannot reach the build service at ${base}. Check the API URL and network connection.` }
    }

    if (res.ok) return res.json() as Promise<T>

    lastStatus = res.status
    lastRaw = (await res.text().catch(() => '')).slice(0, 1000)
    try {
      const parsed = JSON.parse(lastRaw) as ApiError
      lastCode = parsed.code
      lastRaw = parsed.error || lastRaw
    } catch {}

    const retryable = RETRYABLE_CODES.has(lastCode || '') || res.status === 503
    if (!retryable || attempt >= maxRetries) break

    const header = res.headers.get('retry-after')
    const seconds = header ? Number(header) : NaN
    const waitMs = Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1000, 30_000)
      : Math.min(500 * 2 ** attempt, 4_000)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  return { error: actionableError(lastStatus, lastCode, lastRaw), code: lastCode }
}

function isApiError(value: unknown): value is ApiError {
  return Boolean(value && typeof value === 'object' && typeof (value as ApiError).error === 'string')
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
    const result = await postJson<BuildResult>(this.apiUrl, {
      path: '/api/build',
      body: req,
      timeoutMs: 320_000,
      maxRetries: 3,
    })
    if (isApiError(result)) return { success: false, logs: '', error: result.error, code: result.code }
    return result
  }

  async health(): Promise<HealthStatus | ApiError> {
    try {
      const res = await fetchWithTimeout(`${this.apiUrl}/api/health`, {}, 15_000)
      return res.json() as Promise<HealthStatus>
    } catch {
      return { error: `Cannot reach the build service at ${this.apiUrl}.` }
    }
  }

  async deploy(bytecodeBase64: string, authoritySecretKey: string, programKeypair: string | undefined, cluster: string | undefined, confirmMainnet = false): Promise<{ signature?: string; programId?: string; error?: string }> {
    const result = await postJson<{ signature?: string; programId?: string }>(this.apiUrl, {
      path: '/api/deploy',
      body: { bytecodeBase64, authoritySecretKey, programKeypair, cluster, confirmMainnet },
      timeoutMs: 130_000,
    })
    return isApiError(result) ? { error: result.error } : result
  }

  async simulate(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string): Promise<{
    success?: boolean; programId?: string; bytecodeSize?: number; estimatedRentSol?: number;
    authorityBalance?: number; hasSufficientBalance?: boolean; output?: string; error?: string
  }> {
    const result = await postJson<any>(this.apiUrl, {
      path: '/api/simulate',
      body: { bytecodeBase64, authoritySecretKey, programKeypair, cluster },
      timeoutMs: 30_000,
      maxRetries: 0,
    })
    return isApiError(result) ? { error: result.error } : result
  }

  async debugCpi(bytecodeBase64: string, idl?: unknown): Promise<{
    success?: boolean; programId?: string; cpiTree?: any[]; rawLogs?: string; summary?: any; error?: string
  }> {
    const result = await postJson<any>(this.apiUrl, {
      path: '/api/debug-cpi',
      body: { bytecodeBase64, idl },
      timeoutMs: 30_000,
      maxRetries: 0,
    })
    return isApiError(result) ? { error: result.error } : result
  }

  async airdrop(address: string, amount = 2, cluster?: string): Promise<{ signature?: string; error?: string }> {
    const result = await postJson<{ signature?: string }>(this.apiUrl, {
      path: '/api/airdrop',
      body: { address, amount, cluster },
      timeoutMs: 30_000,
      maxRetries: 1,
    })
    return isApiError(result) ? { error: result.error } : result
  }

  async getBalance(address: string, cluster?: string): Promise<{ balance: number } | ApiError> {
    const params = cluster ? `?cluster=${encodeURIComponent(cluster)}` : ''
    try {
      const res = await fetchWithTimeout(
        `${this.apiUrl}/api/balance/${encodeURIComponent(address)}${params}`,
        {},
        15_000,
      )
      return res.json() as Promise<{ balance: number }>
    } catch {
      return { error: `Cannot reach the build service at ${this.apiUrl}.` }
    }
  }

  async profile(bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, instructionData?: string, cluster?: string): Promise<{
    success?: boolean; totalCuConsumed?: number; cuCap?: number; cuUtilization?: number;
    programId?: string; instructions?: any[]; error?: string; logs?: string[]
  }> {
    const result = await postJson<any>(this.apiUrl, {
      path: '/api/profile',
      body: { bytecodeBase64, authoritySecretKey, programKeypair, instructionData, cluster },
      timeoutMs: 30_000,
      maxRetries: 0,
    })
    return isApiError(result) ? { error: result.error } : result
  }
}
