export interface CommandResult {
  output: string
  type: 'output' | 'error' | 'system'
}

export type CommandHandler = (args: string[]) => Promise<CommandResult> | CommandResult
