import type { Idl } from '@solshift/core'

export function generateClient(idl: Idl): string {
  const { name } = idl
  const pascalName = name.charAt(0).toUpperCase() + name.slice(1)

  return `
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Program, AnchorProvider, Idl as AnchorIdl } from "@project-serum/anchor";
import idlJson from "./${name}.json";

const idl = idlJson as AnchorIdl;

export class ${pascalName}Client {
  private program: Program;

  constructor(connection: Connection, wallet: any) {
    const provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program(idl, provider);
  }

${idl.instructions.map(ix => {
  const argsType = ix.args.length > 0
    ? `{ ${ix.args.map(a => `${a.name}: ${idlTypeToTs(a.type)}`).join(', ')} }`
    : '{}'
  return `  async ${ix.name}(args: ${argsType}): Promise<string> {
    return this.program.methods${ix.args.length > 0
      ? `.${ix.name}(${ix.args.map(a => `args.${a.name}`).join(', ')})`
      : `.${ix.name}()`}.rpc();
  }`
}).join('\n\n')}
}
`
}

function idlTypeToTs(t: any): string {
  if (typeof t === 'string') {
    if (t === 'publicKey') return 'PublicKey'
    if (t === 'u64' || t === 'i64') return 'anchor.BN'
    return t
  }
  if (t.vec) return `${idlTypeToTs(t.vec)}[]`
  if (t.option) return `${idlTypeToTs(t.option)} | null`
  if (t.defined) return t.defined
  if (t.array) return `${idlTypeToTs(t.array[0])}[${t.array[1]}]`
  return 'any'
}
