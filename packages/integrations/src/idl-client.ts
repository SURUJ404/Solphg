import type { Idl } from '@solshift/core'

/**
 * Minimal, tolerant view of an Anchor IDL. Anchor 0.31 emits `address`,
 * `writable`/`signer` and `kind: 'struct'` typedefs; older Anchor and the
 * legacy `Idl` type in @solshift/core use `metadata.address`, `isMut`/
 * `isSigner` and flat fields. Accept both so the generator works on the IDL
 * returned by the compiler API regardless of toolchain version.
 */
export interface ClientIdl {
  name?: string
  address?: string
  instructions?: Array<{
    name: string
    args?: Array<{ name: string; type: unknown }>
    accounts?: Array<{ name: string; isMut?: boolean; writable?: boolean; isSigner?: boolean; signer?: boolean; isOptional?: boolean }>
  }>
  types?: Array<{ name: string; type?: unknown }>
  metadata?: { address?: string; name?: string }
}

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield',
])

function safeIdent(value: string): string {
  const cleaned = String(value).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1')
  return cleaned && !RESERVED.has(cleaned) ? cleaned : `_${cleaned || 'value'}`
}

function pascalCase(value: string): string {
  const parts = safeIdent(value).split('_').filter(Boolean)
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('') || 'Program'
}

function isTypeObject(t: unknown): t is Record<string, unknown> {
  return typeof t === 'object' && t !== null
}

function idlTypeToTs(type: unknown): string {
  if (typeof type === 'string') {
    switch (type) {
      case 'publicKey': return 'PublicKey'
      case 'bool': return 'boolean'
      case 'string': return 'string'
      case 'bytes': return 'Uint8Array'
      case 'u8': case 'u16': case 'u32': case 'i8': case 'i16': case 'i32': return 'number'
      case 'u64': case 'u128': case 'i64': case 'i128': return 'bigint'
      default: return 'number'
    }
  }
  if (isTypeObject(type)) {
    if ('vec' in type) return `${idlTypeToTs(type.vec)}[]`
    if ('option' in type) return `${idlTypeToTs(type.option)} | null`
    if (Array.isArray(type.array)) return `${idlTypeToTs(type.array[0])}[]`
    if (typeof type.defined === 'string') return pascalCase(type.defined)
    if (Array.isArray(type.map)) return `Map<${idlTypeToTs(type.map[0])}, ${idlTypeToTs(type.map[1])}>`
    if (type.kind === 'struct' && Array.isArray(type.fields)) {
      const fields = (type.fields as Array<{ name: string; type: unknown }>)
        .map((f) => `${safeIdent(f.name)}: ${idlTypeToTs(f.type)}`)
      return fields.length ? `{ ${fields.join('; ')} }` : 'Record<string, never>'
    }
    if (type.kind === 'enum' && Array.isArray(type.variants)) {
      const variants = (type.variants as Array<{ name: string; fields?: Array<{ name: string; type: unknown }> }>)
        .map((v) => {
          const fields = v.fields || []
          const payload = fields.length
            ? `{ ${fields.map((f) => `${safeIdent(f.name)}: ${idlTypeToTs(f.type)}`).join('; ')} }`
            : 'null'
          return `{ ${pascalCase(v.name)}: ${payload} }`
        })
      return variants.length ? variants.join(' | ') : 'never'
    }
  }
  return 'unknown'
}

/**
 * Generate a typed TypeScript client from an IDL returned by POST /api/build.
 *
 * The generated file targets @coral-xyz/anchor 0.31 (the toolchain shipped in
 * the builder image) and uses native `bigint` for 64/128-bit integers. It is
 * a starting point to review, not a substitute for generated account/PDA
 * resolvers: account addresses are supplied by the caller.
 */
export function generateClient(idlValue: unknown): string {
  const idl = idlValue as ClientIdl | null | undefined
  if (!idl || !Array.isArray(idl.instructions)) {
    throw new Error('IDL must contain an instructions array')
  }

  const name = safeIdent(idl.name || idl.metadata?.name || 'program')
  const fileName = name.replace(/^_+/, '') || 'program'
  const className = `${pascalCase(name)}Client`
  const address = idl.address || idl.metadata?.address || ''

  const typeAliases = (idl.types || [])
    .filter((t) => t && typeof t.name === 'string')
    .map((t) => `export type ${pascalCase(t.name)} = ${idlTypeToTs(t.type)};`)
    .join('\n')

  const methods = idl.instructions.map((ix) => {
    const method = safeIdent(ix.name)
    const args = ix.args || []
    const accounts = ix.accounts || []
    const argsParam = args.length
      ? `args: { ${args.map((a) => `${safeIdent(a.name)}: ${idlTypeToTs(a.type)}`).join('; ')} }`
      : ''
    const accountsParam = accounts.length
      ? `accounts: { ${accounts.map((a) => `${safeIdent(a.name)}: PublicKey`).join('; ')} }`
      : ''
    const params = [argsParam, accountsParam].filter(Boolean).join(', ')
    const callArgs = args.map((a) => `args.${safeIdent(a.name)}`).join(', ')
    const accountArgs = accounts.map((a) => `${safeIdent(a.name)}: accounts.${safeIdent(a.name)}`).join(', ')
    let chain = `this.program.methods.${method}(${callArgs})`
    if (accounts.length) chain += `.accounts({ ${accountArgs} })`
    chain += '.rpc()'
    return `  async ${method}(${params}): Promise<string> {\n    return ${chain};\n  }`
  }).join('\n\n')

  const programId = address ? `\nexport const PROGRAM_ID = new PublicKey(${JSON.stringify(address)});\n` : ''
  const types = typeAliases ? `\n${typeAliases}\n` : ''

  return `// Generated from the ${fileName} IDL by Solphg. Review before production use.
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idlJson from "./${fileName}.json";

const idl = idlJson as anchor.Idl;
${programId}${types}
export class ${className} {
  readonly program: anchor.Program;

  constructor(connection: Connection, wallet: anchor.Wallet) {
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    this.program = new anchor.Program(idl, provider);
  }

${methods || '  // This program has no instructions.'}
}
`
}

// Keep the legacy type import meaningful for consumers that already pass Idl.
export type GeneratedIdl = Idl
