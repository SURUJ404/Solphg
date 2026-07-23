import { describe, it, expect } from 'vitest'
import { parseCpiLogs, parseCpuProfileLogs } from './log-parsers'

describe('parseCpiLogs', () => {
  it('parses a simple invoke-success pair', () => {
    const logs = `Program 11111111111111111111111111111111 invoke [1]
Program 11111111111111111111111111111111 success`
    const result = parseCpiLogs(logs)
    expect(result).toHaveLength(1)
    expect(result[0].programId).toBe('11111111111111111111111111111111')
    expect(result[0].success).toBe(true)
    expect(result[0].depth).toBe(1)
  })

  it('parses nested CPI invocations', () => {
    const logs = `Program 11111111111111111111111111111111 invoke [1]
Program 22222222222222222222222222222222 invoke [2]
Program 22222222222222222222222222222222 success
Program 11111111111111111111111111111111 success`
    const result = parseCpiLogs(logs)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0].programId).toBe('22222222222222222222222222222222')
    expect(result[0].children[0].success).toBe(true)
  })

  it('captures error messages on failure', () => {
    const logs = `Program 11111111111111111111111111111111 invoke [1]
Program 11111111111111111111111111111111 failed: custom program error: 0x1`
    const result = parseCpiLogs(logs)
    expect(result[0].success).toBe(false)
    expect(result[0].error).toContain('custom program error')
  })

  it('returns empty array for empty input', () => {
    expect(parseCpiLogs('')).toEqual([])
  })

  it('extracts compute units', () => {
    const logs = `Program 11111111111111111111111111111111 invoke [1]
Program 11111111111111111111111111111111 consumed 50000 of 200000
Program 11111111111111111111111111111111 success`
    const result = parseCpiLogs(logs)
    expect(result[0].computeUnits).toBe('50000 / 200000')
  })
})

describe('parseCpuProfileLogs', () => {
  it('parses profile logs into tree structure', () => {
    const logs = [
      'Program 11111111111111111111111111111111 invoke [1]',
      'Program 11111111111111111111111111111111 consumed 100000 of 200000',
      'Program 11111111111111111111111111111111 success',
    ]
    const result = parseCpuProfileLogs(logs)
    expect(result.tree).toHaveLength(1)
    expect(result.tree[0].programId).toBe('11111111111111111111111111111111')
    expect(result.tree[0].cuConsumed).toBe(100000)
    expect(result.totalCu).toBe(100000)
  })

  it('handles nested profile with CU attribution', () => {
    const logs = [
      'Program A invoke [1]',
      'Program B invoke [2]',
      'Program B consumed 30000 of 200000',
      'Program B success',
      'Program A consumed 50000 of 200000',
      'Program A success',
    ]
    const result = parseCpuProfileLogs(logs)
    expect(result.tree).toHaveLength(1)
    expect(result.tree[0].children).toHaveLength(1)
    expect(result.tree[0].cuConsumed).toBe(50000)
    expect(result.tree[0].children[0].cuConsumed).toBe(30000)
    expect(result.totalCu).toBe(50000)
  })

  it('returns empty for missing log lines', () => {
    const result = parseCpuProfileLogs([])
    expect(result.tree).toEqual([])
    expect(result.totalCu).toBe(0)
  })
})
