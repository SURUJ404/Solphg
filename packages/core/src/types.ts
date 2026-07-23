// PublicKey and Transaction are used as opaque types — we use string representations
// and import @solana/web3.js only at runtime in the app/service layer.

export interface SolpgProject {
  id: string
  name: string
  files: SolpgFile[]
  framework: 'anchor' | 'native'
}

export interface SolpgFile {
  name: string
  path: string
  content: string
  language: 'rust' | 'typescript' | 'json' | 'plain'
}

export interface Idl {
  version: string
  name: string
  instructions: IdlInstruction[]
  accounts: IdlAccount[]
  types: IdlType[]
  errors: IdlError[]
  metadata?: IdlMetadata
}

export interface IdlInstruction {
  name: string
  accounts: IdlAccountMeta[]
  args: IdlField[]
  returns?: IdlType
}

export interface IdlAccountMeta {
  name: string
  isMut: boolean
  isSigner: boolean
  isOptional?: boolean
  pda?: IdlPda
}

export interface IdlPda {
  seeds: IdlSeed[]
  programId?: string
}

export type IdlSeed = { kind: 'account'; path: string } | { kind: 'arg'; path: string } | { kind: 'const'; value: number[] }

export interface IdlField {
  name: string
  type: IdlType
}

export type IdlType =
  | 'bool'
  | 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'i8' | 'i16' | 'i32' | 'i64' | 'i128'
  | 'string'
  | 'publicKey'
  | { defined: string }
  | { vec: IdlType }
  | { option: IdlType }
  | { array: [IdlType, number] }

export interface IdlAccount {
  name: string
  type: IdlTypeDef
}

export interface IdlTypeDef {
  kind: 'struct' | 'enum'
  fields?: IdlField[]
  variants?: IdlEnumVariant[]
}

export interface IdlEnumVariant {
  name: string
  fields?: IdlField[]
}

export interface IdlError {
  code: number
  name: string
  msg?: string
}

export interface IdlMetadata {
  address: string
  origin?: string
}

export interface WalletState {
  publicKey: string
  secretKey: string
  connected: boolean
}

export interface TerminalLine {
  id: string
  content: string
  type: 'input' | 'output' | 'error' | 'system'
}

export interface CompileResult {
  programId: string
  bytecodeBase64: string
  idl: Idl | null
  stderr: string
}
