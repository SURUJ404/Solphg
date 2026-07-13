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
  error?: string
}

export class CompilerClient {
  private apiUrl: string

  constructor(apiUrl: string = 'http://localhost:8080') {
    this.apiUrl = apiUrl
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
    } catch (err: any) {
      return { success: false, logs: '', error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running (docker compose up).` }
    }
  }

  async health(): Promise<{ status: string; activeBuilds: number; maxConcurrentBuilds: number } | { error: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/health`)
      return res.json()
    } catch {
      return { error: 'Cannot reach build service' }
    }
  }

  async deploy(bytecodeBase64: string, authoritySecretKey: string): Promise<{ signature?: string; error?: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytecodeBase64, authoritySecretKey }),
      })
      return res.json() as Promise<{ signature?: string; error?: string }>
    } catch (err: any) {
      return { error: `Cannot reach build service at ${this.apiUrl}. Make sure Docker is running.` }
    }
  }

  async airdrop(address: string, amount: number = 2): Promise<{ signature?: string; error?: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/airdrop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount }),
      })
      return res.json() as Promise<{ signature?: string; error?: string }>
    } catch {
      return { error: 'Cannot reach build service. Start it with: docker compose up' }
    }
  }

  async getBalance(address: string): Promise<{ balance: number } | { error: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/balance/${address}`)
      return res.json() as Promise<{ balance: number } | { error: string }>
    } catch {
      return { error: 'Cannot reach build service. Start it with: docker compose up' }
    }
  }
}
