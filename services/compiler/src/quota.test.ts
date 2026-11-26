import { describe, it, expect } from 'vitest'
import { IpQuota } from './quota'

describe('IpQuota', () => {
  it('allows requests up to the limit and reports remaining', () => {
    const q = new IpQuota(60_000, 100, () => 1_000)
    expect(q.check('1.2.3.4', 'build', 2)).toEqual({ ok: true, limit: 2, remaining: 1 })
    expect(q.check('1.2.3.4', 'build', 2)).toEqual({ ok: true, limit: 2, remaining: 0 })
  })

  it('rejects over-limit requests with a retry hint', () => {
    let now = 1_000
    const q = new IpQuota(60_000, 100, () => now)
    q.check('1.2.3.4', 'build', 1)
    const denied = q.check('1.2.3.4', 'build', 1)
    expect(denied.ok).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterSec).toBe(60)
  })

  it('resets after the window passes', () => {
    let now = 1_000
    const q = new IpQuota(1_000, 100, () => now)
    expect(q.check('1.2.3.4', 'deploy', 1).ok).toBe(true)
    expect(q.check('1.2.3.4', 'deploy', 1).ok).toBe(false)
    now += 1_001
    expect(q.check('1.2.3.4', 'deploy', 1).ok).toBe(true)
  })

  it('tracks actions and IPs independently', () => {
    const q = new IpQuota(60_000, 100, () => 1_000)
    expect(q.check('1.2.3.4', 'build', 1).ok).toBe(true)
    expect(q.check('1.2.3.4', 'deploy', 1).ok).toBe(true)
    expect(q.check('5.6.7.8', 'build', 1).ok).toBe(true)
  })

  it('evicts old entries rather than growing without bound', () => {
    const q = new IpQuota(10, 2, () => 1_000)
    expect(q.check('a', 'build', 1).ok).toBe(true)
    expect(q.check('b', 'build', 1).ok).toBe(true)
    // 'a' and 'b' expired; adding 'c' should sweep them out.
    expect(q.check('c', 'build', 1).ok).toBe(true)
  })
})
