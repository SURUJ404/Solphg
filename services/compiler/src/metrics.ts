// In-process metrics. Intentionally dependency-free and bounded: the last
// 500 build durations are kept for percentile calculation.
export interface BuildSample {
  durationMs: number;
  cached: boolean;
  success: boolean;
}

class Metrics {
  private builds = 0;
  private cacheHits = 0;
  private errors = 0;
  private samples: BuildSample[] = [];
  private readonly maxSamples = 500;
  private errorCodes = new Map<string, number>();
  private readonly startedAt = Date.now();

  recordBuild(sample: BuildSample): void {
    this.builds++;
    if (sample.cached) this.cacheHits++;
    if (!sample.success) this.errors++;
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  recordError(code: string): void {
    this.errorCodes.set(code, (this.errorCodes.get(code) ?? 0) + 1);
  }

  snapshot(): Record<string, unknown> {
    const durations = this.samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const percentile = (p: number): number | null => {
      if (durations.length === 0) return null;
      const idx = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length));
      return durations[idx];
    };
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      builds: {
        total: this.builds,
        cacheHits: this.cacheHits,
        cacheHitRate: this.builds ? Math.round((this.cacheHits / this.builds) * 10000) / 100 : 0,
        errors: this.errors,
        durationMs: {
          p50: percentile(50),
          p95: percentile(95),
          samples: durations.length,
        },
      },
      errorsByCode: Object.fromEntries(this.errorCodes),
    };
  }
}

export const metrics = new Metrics();
