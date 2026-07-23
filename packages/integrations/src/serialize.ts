import type { IdlField } from '@solshift/core'
import { ANCHOR_DISCRIMINATOR_SIZE } from '@solshift/core'

function encodeBorshPrefix(size: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(size, 0)
  return buf
}

export function serializeInstructionArgs(fields: IdlField[], args: Record<string, any>): Buffer {
  const parts: Buffer[] = []

  for (const field of fields) {
    const value = args[field.name]
    const serialized = serializeIdlValue(field.type, value)
    parts.push(serialized)
  }

  return Buffer.concat(parts)
}

function serializeIdlValue(type: any, value: any): Buffer {
  if (typeof type === 'string') {
    switch (type) {
      case 'u8': {
        const b = Buffer.alloc(1)
        b.writeUInt8(value, 0)
        return b
      }
      case 'u16': {
        const b = Buffer.alloc(2)
        b.writeUInt16LE(value, 0)
        return b
      }
      case 'u32': {
        const b = Buffer.alloc(4)
        b.writeUInt32LE(value, 0)
        return b
      }
      case 'u64': {
        const b = Buffer.alloc(8)
        b.writeBigUInt64LE(BigInt(value), 0)
        return b
      }
      case 'i8': {
        const b = Buffer.alloc(1)
        b.writeInt8(value, 0)
        return b
      }
      case 'i16': {
        const b = Buffer.alloc(2)
        b.writeInt16LE(value, 0)
        return b
      }
      case 'i32': {
        const b = Buffer.alloc(4)
        b.writeInt32LE(value, 0)
        return b
      }
      case 'i64': {
        const b = Buffer.alloc(8)
        b.writeBigInt64LE(BigInt(value), 0)
        return b
      }
      case 'string': {
        const str = Buffer.from(value, 'utf-8')
        return Buffer.concat([encodeBorshPrefix(str.length), str])
      }
      case 'publicKey': {
        return Buffer.from(value)
      }
      case 'bool':
        return Buffer.from([value ? 1 : 0])
      default:
        return Buffer.from([])
    }
  }

  if (type.vec) {
    const items = value.map((v: any) => serializeIdlValue(type.vec, v))
    const count = Buffer.alloc(4)
    count.writeUInt32LE(items.length, 0)
    return Buffer.concat([count, ...items])
  }

  if (type.option) {
    if (value === null || value === undefined) {
      return Buffer.from([0])
    }
    return Buffer.concat([Buffer.from([1]), serializeIdlValue(type.option, value)])
  }

  if (type.array) {
    const items = value.map((v: any) => serializeIdlValue(type.array[0], v))
    return Buffer.concat(items)
  }

  return Buffer.from([])
}
