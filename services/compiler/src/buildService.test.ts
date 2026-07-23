import { describe, it, expect } from 'vitest'
import { validateRequest } from './buildService'
import type { BuildRequest } from './types'

function validReq(overrides?: Partial<BuildRequest>): BuildRequest {
  return {
    programName: 'my_counter',
    files: [{ path: 'src/lib.rs', content: 'fn main() {}' }],
    ...overrides,
  }
}

describe('validateRequest', () => {
  it('accepts a valid request', () => {
    expect(validateRequest(validReq())).toBeNull()
  })

  it('rejects missing programName', () => {
    expect(validateRequest(validReq({ programName: '' }))).toMatch(/programName/)
  })

  it('rejects invalid programName with uppercase', () => {
    expect(validateRequest(validReq({ programName: 'MyCounter' }))).toMatch(/programName/)
  })

  it('rejects programName with special chars', () => {
    expect(validateRequest(validReq({ programName: 'my;counter' }))).toMatch(/programName/)
    expect(validateRequest(validReq({ programName: 'my counter' }))).toMatch(/programName/)
  })

  it('rejects programName that is too long', () => {
    expect(validateRequest(validReq({ programName: 'a'.repeat(65) }))).toMatch(/programName/)
  })

  it('accepts programName with underscores and hyphens', () => {
    expect(validateRequest(validReq({ programName: 'my_counter-v2' }))).toBeNull()
  })

  it('rejects empty files array', () => {
    expect(validateRequest(validReq({ files: [] }))).toMatch(/non-empty/)
  })

  it('rejects too many files', () => {
    const files = Array.from({ length: 41 }, (_, i) => ({ path: `file${i}.rs`, content: '' }))
    expect(validateRequest(validReq({ files }))).toMatch(/too many/)
  })

  it('rejects absolute file path', () => {
    const files = [{ path: '/etc/passwd', content: '' }]
    expect(validateRequest(validReq({ files }))).toMatch(/invalid file path/)
  })

  it('rejects path traversal', () => {
    const files = [{ path: '../../secret.json', content: '' }]
    expect(validateRequest(validReq({ files }))).toMatch(/invalid file path/)
  })

  it('rejects oversized file', () => {
    const files = [{ path: 'big.rs', content: 'x'.repeat(200_001) }]
    expect(validateRequest(validReq({ files }))).toMatch(/file too large/)
  })
})
