import type { TerminalLine, WalletState } from '@solshift/core'
import type { CommandHandler, CommandResult } from './types.js'
import { CompilerClient } from '@solshift/engine'

export class TerminalEmulator {
  private handlers = new Map<string, CommandHandler>()
  private lines: TerminalLine[] = []
  private compilerClient: CompilerClient
  private wallet: WalletState | null = null
  private buildCallback: (() => Promise<void>) | null = null
  private deployCallback: (() => Promise<void>) | null = null

  constructor(compilerClient: CompilerClient) {
    this.compilerClient = compilerClient
    this.registerDefaultHandlers()
  }

  setWallet(w: WalletState | null): void {
    this.wallet = w
  }

  getWallet(): WalletState | null {
    return this.wallet
  }

  onBuild(cb: () => Promise<void>): void {
    this.buildCallback = cb
  }

  onDeploy(cb: () => Promise<void>): void {
    this.deployCallback = cb
  }

  private registerDefaultHandlers(): void {
    this.handlers.set('help', () => ({
      output: `Available commands:
  help                  - Show this help
  clear                 - Clear terminal
  solana airdrop [n]    - Request devnet SOL airdrop (default 2 SOL)
  solana balance        - Check wallet balance
  solana address        - Show wallet public key
  anchor build          - Build the Anchor project
  anchor deploy         - Deploy compiled program`,
      type: 'output',
    }))

    this.handlers.set('clear', () => {
      this.lines = []
      return { output: '', type: 'system' }
    })

    this.handlers.set('solana', async (args) => {
      const sub = args[0]
      if (sub === 'airdrop') {
        if (!this.wallet) return { output: 'Generate a wallet first (click "Generate Wallet")', type: 'error' }
        const amount = args[1] ? parseInt(args[1]) : 2
        const data = await this.compilerClient.airdrop(this.wallet.publicKey, amount)
        if ('error' in data && data.error) return { output: `Airdrop failed: ${data.error}`, type: 'error' }
        return { output: `Airdropped ${amount} SOL. Tx: ${data.signature}`, type: 'output' }
      }
      if (sub === 'balance') {
        if (!this.wallet) return { output: 'Generate a wallet first', type: 'error' }
        const data = await this.compilerClient.getBalance(this.wallet.publicKey)
        if ('error' in data) return { output: `Balance check failed: ${data.error}`, type: 'error' }
        return { output: `Balance: ${data.balance} SOL`, type: 'output' }
      }
      if (sub === 'address') {
        if (!this.wallet) return { output: 'Generate a wallet first', type: 'error' }
        return { output: `Wallet address: ${this.wallet.publicKey}`, type: 'output' }
      }
      return { output: `Unknown solana subcommand: ${sub}. Try: airdrop, balance, address`, type: 'error' }
    })

    this.handlers.set('anchor', async (args) => {
      const sub = args[0]
      if (sub === 'build') {
        if (this.buildCallback) {
          await this.buildCallback()
          return { output: '', type: 'system' }
        }
        return { output: 'Build callback not registered', type: 'error' }
      }
      if (sub === 'deploy') {
        if (this.deployCallback) {
          await this.deployCallback()
          return { output: '', type: 'system' }
        }
        return { output: 'Deploy callback not registered', type: 'error' }
      }
      return { output: `Unknown anchor subcommand: ${sub}. Try: build, deploy`, type: 'error' }
    })
  }

  registerCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler)
  }

  async execute(input: string): Promise<TerminalLine[]> {
    const inputLine: TerminalLine = { id: crypto.randomUUID(), content: `$ ${input}`, type: 'input' }
    this.lines.push(inputLine)

    const trimmed = input.trim()
    if (!trimmed) return [inputLine]

    const parts = trimmed.split(/\s+/)
    const handler = this.handlers.get(parts[0])

    if (!handler) {
      const errLine: TerminalLine = {
        id: crypto.randomUUID(),
        content: `Unknown command: ${parts[0]}. Type 'help' for available commands.`,
        type: 'error',
      }
      this.lines.push(errLine)
      return [inputLine, errLine]
    }

    const result = await handler(parts.slice(1))
    if (result.output) {
      const outputLine: TerminalLine = { id: crypto.randomUUID(), content: result.output, type: result.type }
      this.lines.push(outputLine)
      return [inputLine, outputLine]
    }

    return [inputLine]
  }

  getLines(): TerminalLine[] {
    return this.lines
  }

  clear(): void {
    this.lines = []
  }
}
