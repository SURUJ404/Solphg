export interface QuotaDecision {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec?: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Bounded, fixed-window quota per (action, client IP). This complements the
 * short express-rate-limit window: a client can stay under the per-minute
 * limit and still exhaust an hourly build/deploy allowance.
 *
 * The map is swept on every check and capped at maxEntries so an attacker
 * rotating source IPs cannot grow it without bound.
 */
export class IpQuota {
  private readonly counters = new Map<string, Counter>();

  constructor(
    private readonly windowMs: number,
    private readonly maxEntries = 20_000,
    private readonly now: () => number = Date.now,
  ) {}

  public check(ip: string, action: string, limit: number): QuotaDecision {
    const now = this.now();
    this.sweep(now);
    const key = `${action}:${ip}`;
    const current = this.counters.get(key);

    if (!current || current.resetAt <= now) {
      if (this.counters.size >= this.maxEntries) this.sweep(now, true);
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true, limit, remaining: limit - 1 };
    }

    if (current.count >= limit) {
      return {
        ok: false,
        limit,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count++;
    return { ok: true, limit, remaining: limit - current.count };
  }

  private sweep(now: number, force = false): void {
    for (const [key, value] of this.counters) {
      if (value.resetAt <= now) this.counters.delete(key);
    }
    if (!force || this.counters.size <= this.maxEntries) return;
    const excess = this.counters.size - this.maxEntries + 1;
    const oldest = [...this.counters.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, excess);
    for (const [key] of oldest) this.counters.delete(key);
  }
}
