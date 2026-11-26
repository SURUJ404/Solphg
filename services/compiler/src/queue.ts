/**
 * Concurrency gate for expensive builds.
 *
 * The default implementation is process-local. For horizontal scaling, provide
 * a Redis-backed implementation of this interface (with atomic Lua-script
 * acquire/release and TTL-based stale-lock expiry) and pass it to
 * SandboxedBuildService. Callers receive 429 + Retry-After when tryAcquire()
 * returns false, so a remote implementation can be added without changing the
 * public API.
 */
export interface BuildQueue {
  readonly depth: number
  readonly max: number
  tryAcquire(): boolean
  release(): void
}

export class InMemoryBuildQueue implements BuildQueue {
  private active = 0

  constructor(readonly max: number) {}

  public get depth(): number {
    return this.active
  }

  public tryAcquire(): boolean {
    if (this.active >= this.max) return false
    this.active++
    return true
  }

  public release(): void {
    if (this.active > 0) this.active--
  }
}
