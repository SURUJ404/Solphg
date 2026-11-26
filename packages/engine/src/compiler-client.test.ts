import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompilerClient, parseRustDiagnostics } from './compiler-client'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const req = { programName: 'counter', files: [{ path: 'src/lib.rs', content: 'fn main() {}' }] }

describe('CompilerClient.build', () => {
  it('passes through cached and timing metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      success: true,
      logs: 'ok',
      program: 'AAAA',
      programId: '11111111111111111111111111111111',
      cached: true,
      cacheKey: 'abc123',
      durationMs: 42,
    }))
    const result = await new CompilerClient('https://api.example').build(req)
    expect(result.cached).toBe(true)
    expect(result.cacheKey).toBe('abc123')
    expect(result.durationMs).toBe(42)
  })

  it('retries a queue-full 429 and succeeds on the next attempt', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'busy', code: 'BUILD_QUEUE_FULL' }, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, logs: 'ok', cached: false }))

    const promise = new CompilerClient('https://api.example').build(req)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await promise
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry validation errors and returns an actionable message', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      error: 'programName must match ^[a-z]', code: 'INVALID_REQUEST',
    }, 400))
    const result = await new CompilerClient('https://api.example').build(req)
    expect(result.success).toBe(false)
    expect(result.error).toContain('rejected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('turns a timeout into an actionable error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      error: 'build timed out', code: 'BUILD_TIMEOUT',
    }, 504))
    const result = await new CompilerClient('https://api.example').build(req)
    expect(result.error).toContain('time limit')
  })

  it('handles network failures without leaking raw details', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.1:5432'))
    const result = await new CompilerClient('https://api.example').build(req)
    expect(result.error).toContain('Cannot reach the build service')
    expect(result.error).not.toContain('10.0.0.1')
  })
})

describe('parseRustDiagnostics', () => {
  it('extracts file:line:column errors for editor markers', () => {
    const logs = [
      '   Compiling counter v0.1.0',
      'error[E0308]: mismatched types',
      '  --> src/lib.rs:12:5',
      'src/lib.rs:12:5: error[E0308]: mismatched types',
      'src/lib.rs:20:1: warning: unused import',
    ].join('\n')
    expect(parseRustDiagnostics(logs)).toEqual([
      { file: 'src/lib.rs', line: 12, column: 5, message: 'mismatched types' },
    ])
  })
})
