import { describe, expect, it } from 'vitest'
import { InMemoryBuildQueue } from './queue'

describe('InMemoryBuildQueue', () => {
  it('allows up to max concurrent builds and reports depth', () => {
    const q = new InMemoryBuildQueue(1)
    expect(q.tryAcquire()).toBe(true)
    expect(q.depth).toBe(1)
    expect(q.tryAcquire()).toBe(false)
    q.release()
    expect(q.depth).toBe(0)
    expect(q.tryAcquire()).toBe(true)
  })

  it('never goes negative on extra releases', () => {
    const q = new InMemoryBuildQueue(1)
    q.release()
    expect(q.depth).toBe(0)
  })

  it('exposes max for the health endpoint', () => {
    expect(new InMemoryBuildQueue(4).max).toBe(4)
  })
})
