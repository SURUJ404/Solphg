import { describe, expect, it } from 'vitest'
import { generateClient } from './idl-client'

const ADDRESS = '11111111111111111111111111111111'

const anchor031Idl = {
  address: ADDRESS,
  metadata: { name: 'counter', version: '0.1.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'initialize',
      args: [],
      accounts: [
        { name: 'counter', writable: true, signer: false },
        { name: 'payer', writable: true, signer: true },
      ],
    },
    {
      name: 'increment',
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'memo', type: { option: 'string' } },
        { name: 'owners', type: { vec: 'publicKey' } },
      ],
      accounts: [{ name: 'counter', writable: true, signer: false }],
    },
  ],
  types: [
    {
      name: 'CounterState',
      type: { kind: 'struct', fields: [{ name: 'count', type: 'u64' }] },
    },
  ],
}

describe('generateClient', () => {
  it('rejects a non-IDL input with a clear message', () => {
    expect(() => generateClient(null)).toThrow(/instructions array/)
    expect(() => generateClient({ name: 'x' })).toThrow(/instructions array/)
  })

  it('generates a typed client targeting Anchor 0.31', () => {
    const code = generateClient(anchor031Idl)
    expect(code).toContain('import * as anchor from "@coral-xyz/anchor"')
    expect(code).toContain('new anchor.Program(idl, provider)')
    expect(code).toContain('export class CounterClient')
    expect(code).toContain(`export const PROGRAM_ID = new PublicKey("${ADDRESS}")`)
    expect(code).toContain('import idlJson from "./counter.json"')
  })

  it('includes account maps and typed args for each instruction', () => {
    const code = generateClient(anchor031Idl)
    expect(code).toContain('async initialize(accounts: { counter: PublicKey; payer: PublicKey })')
    expect(code).toContain('.accounts({ counter: accounts.counter, payer: accounts.payer })')
    expect(code).toContain('amount: bigint')
    expect(code).toContain('memo: string | null')
    expect(code).toContain('owners: PublicKey[]')
    expect(code).toContain('.increment(args.amount, args.memo, args.owners)')
  })

  it('emits typed aliases for defined types', () => {
    const code = generateClient(anchor031Idl)
    expect(code).toContain('export type CounterState = { count: bigint }')
  })

  it('supports legacy isMut/isSigner and metadata.address IDLs', () => {
    const code = generateClient({
      name: 'spl_transfer',
      metadata: { address: ADDRESS },
      instructions: [{
        name: 'mint_to',
        args: [{ name: 'amount', type: 'u64' }],
        accounts: [{ name: 'mint', isMut: true, isSigner: false }],
      }],
      types: [],
      accounts: [],
      errors: [],
      version: '0.1.0',
    })
    expect(code).toContain('export class SplTransferClient')
    expect(code).toContain(`new PublicKey("${ADDRESS}")`)
    expect(code).toContain('accounts: { mint: PublicKey }')
  })

  it('sanitises names and handles instructions with no args or accounts', () => {
    const code = generateClient({
      name: 'my-program',
      instructions: [{ name: 'ping', args: [], accounts: [] }],
    })
    expect(code).toContain('export class MyProgramClient')
    expect(code).toContain('async ping(): Promise<string>')
    expect(code).toContain('this.program.methods.ping().rpc()')
    expect(code).not.toContain('PROGRAM_ID')
  })

  it('maps nested and defined types without emitting unknown for known shapes', () => {
    const code = generateClient({
      name: 'types_demo',
      instructions: [{
        name: 'set',
        args: [
          { name: 'flag', type: 'bool' },
          { name: 'data', type: 'bytes' },
          { name: 'pair', type: { array: ['u8', 4] } },
          { name: 'state', type: { defined: 'counter_state' } },
        ],
        accounts: [],
      }],
      types: [{ name: 'counter_state', type: { kind: 'enum', variants: [{ name: 'idle' }, { name: 'active', fields: [{ name: 'since', type: 'i64' }] }] } }],
    })
    expect(code).toContain('flag: boolean')
    expect(code).toContain('data: Uint8Array')
    expect(code).toContain('pair: number[]')
    expect(code).toContain('state: CounterState')
    expect(code).toContain('export type CounterState = { Idle: null } | { Active: { since: bigint } }')
  })
})
