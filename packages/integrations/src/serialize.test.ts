import { describe, it, expect } from 'vitest'
import { serializeInstructionArgs } from './serialize'

describe('serializeInstructionArgs', () => {
  it('serializes u8 field', () => {
    const fields = [{ name: 'val', type: 'u8' }]
    const buf = serializeInstructionArgs(fields, { val: 42 })
    expect(buf).toEqual(Buffer.from([42]))
  })

  it('serializes u64 field', () => {
    const fields = [{ name: 'val', type: 'u64' }]
    const buf = serializeInstructionArgs(fields, { val: 1_000_000 })
    const expected = Buffer.alloc(8)
    expected.writeBigUInt64LE(BigInt(1_000_000))
    expect(buf).toEqual(expected)
  })

  it('serializes string field with Borsh length prefix', () => {
    const fields = [{ name: 'name', type: 'string' }]
    const buf = serializeInstructionArgs(fields, { name: 'hello' })
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32LE(5, 0)
    expect(buf).toEqual(Buffer.concat([prefix, Buffer.from('hello')]))
  })

  it('serializes bool field', () => {
    const fields = [{ name: 'flag', type: 'bool' }]
    expect(serializeInstructionArgs(fields, { flag: true })).toEqual(Buffer.from([1]))
    expect(serializeInstructionArgs(fields, { flag: false })).toEqual(Buffer.from([0]))
  })

  it('serializes vec<u8> field', () => {
    const fields = [{ name: 'items', type: { vec: 'u8' } }]
    const buf = serializeInstructionArgs(fields, { items: [10, 20, 30] })
    const count = Buffer.alloc(4)
    count.writeUInt32LE(3, 0)
    expect(buf).toEqual(Buffer.concat([count, Buffer.from([10]), Buffer.from([20]), Buffer.from([30])]))
  })

  it('serializes option with null value', () => {
    const fields = [{ name: 'opt', type: { option: 'u8' } }]
    const buf = serializeInstructionArgs(fields, { opt: null })
    expect(buf).toEqual(Buffer.from([0]))
  })

  it('serializes option with present value', () => {
    const fields = [{ name: 'opt', type: { option: 'u8' } }]
    const buf = serializeInstructionArgs(fields, { opt: 7 })
    expect(buf).toEqual(Buffer.concat([Buffer.from([1]), Buffer.from([7])]))
  })

  it('throws on unknown scalar type', () => {
    const fields = [{ name: 'x', type: 'f64' }]
    expect(() => serializeInstructionArgs(fields, { x: 1.0 })).toThrow('Unsupported IDL type')
  })

  it('throws on defined type', () => {
    const fields = [{ name: 'x', type: { defined: 'MyStruct' } }]
    expect(() => serializeInstructionArgs(fields, { x: {} })).toThrow('Unsupported IDL defined type')
  })

  it('serializes publicKey field', () => {
    const pk = new Array(32).fill(0).map((_, i) => i)
    const fields = [{ name: 'owner', type: 'publicKey' }]
    const buf = serializeInstructionArgs(fields, { owner: pk })
    expect(buf).toEqual(Buffer.from(pk))
  })
})
