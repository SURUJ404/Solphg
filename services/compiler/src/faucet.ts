import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config";
import { log } from "./logger";

interface FaucetState {
  day: string;
  spentLamports: number;
  cooldowns: Record<string, number>;
  updatedAt: number;
}

export interface Reservation {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
  spentTodaySol?: number;
  remainingTodaySol?: number;
}

const DAY_MS = 86_400_000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Durable spending ledger for the faucet. Survives restarts by persisting to
 * disk, enforces a per-address cooldown and a global daily SOL cap, and
 * serialises reservations so two concurrent requests cannot overspend.
 */
export class FaucetLedger {
  private state: FaucetState = { day: todayUtc(), spentLamports: 0, cooldowns: {}, updatedAt: Date.now() };
  private loaded = false;
  private chain: Promise<unknown> = Promise.resolve();
  private persistDisabled = false;

  constructor(
    private readonly stateFile: string,
    private readonly dailyCapSol: number,
    private readonly cooldownSeconds: number,
  ) {}

  public async init(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.stateFile, "utf8")) as Partial<FaucetState>;
      if (raw && typeof raw.day === "string" && typeof raw.spentLamports === "number") {
        this.state = {
          day: raw.day,
          spentLamports: raw.spentLamports,
          cooldowns: raw.cooldowns && typeof raw.cooldowns === "object" ? raw.cooldowns : {},
          updatedAt: raw.updatedAt ?? Date.now(),
        };
      }
    } catch {
      /* first run */
    }
    this.rolloverIfNeeded();
    this.loaded = true;
  }

  public async reserve(address: string, lamports: number): Promise<Reservation> {
    const task = this.chain.then(async () => this.reserveUnlocked(address, lamports));
    this.chain = task.catch(() => {});
    return task;
  }

  private async reserveUnlocked(address: string, lamports: number): Promise<Reservation> {
    if (!this.loaded) await this.init();
    const now = Date.now();
    this.rolloverIfNeeded(now);

    const cooldownUntil = this.state.cooldowns[address] ?? 0;
    if (cooldownUntil > now) {
      return {
        ok: false,
        reason: "This address requested an airdrop recently. Try again later.",
        retryAfterSec: Math.ceil((cooldownUntil - now) / 1000),
      };
    }

    const capLamports = Math.round(this.dailyCapSol * 1e9);
    if (this.state.spentLamports + lamports > capLamports) {
      const tomorrow = Date.parse(`${this.state.day}T00:00:00Z`) + DAY_MS;
      return {
        ok: false,
        reason: "Daily faucet spending cap reached. Try again after 00:00 UTC.",
        retryAfterSec: Math.max(1, Math.ceil((tomorrow - now) / 1000)),
      };
    }

    this.state.spentLamports += lamports;
    this.state.cooldowns[address] = now + this.cooldownSeconds * 1000;
    this.state.updatedAt = now;
    this.prune(now);
    await this.persist();
    return {
      ok: true,
      spentTodaySol: this.state.spentLamports / 1e9,
      remainingTodaySol: Math.max(0, (capLamports - this.state.spentLamports) / 1e9),
    };
  }

  /** Return a reservation when the transfer itself failed before broadcast. */
  public async refund(address: string, lamports: number): Promise<void> {
    const task = this.chain.then(async () => {
      this.state.spentLamports = Math.max(0, this.state.spentLamports - lamports);
      delete this.state.cooldowns[address];
      this.state.updatedAt = Date.now();
      await this.persist();
    });
    this.chain = task.catch(() => {});
    await task;
  }

  public snapshot(): { day: string; spentTodaySol: number; dailyCapSol: number; addressesOnCooldown: number } {
    this.rolloverIfNeeded();
    return {
      day: this.state.day,
      spentTodaySol: Math.round((this.state.spentLamports / 1e9) * 1e6) / 1e6,
      dailyCapSol: this.dailyCapSol,
      addressesOnCooldown: Object.values(this.state.cooldowns).filter((t) => t > Date.now()).length,
    };
  }

  private rolloverIfNeeded(now = Date.now()): void {
    const today = new Date(now).toISOString().slice(0, 10);
    if (this.state.day !== today) {
      this.state.day = today;
      this.state.spentLamports = 0;
      this.state.updatedAt = now;
    }
  }

  private prune(now: number): void {
    const cutoff = now - 7 * DAY_MS;
    for (const [address, until] of Object.entries(this.state.cooldowns)) {
      if (until < cutoff) delete this.state.cooldowns[address];
    }
  }

  private async persist(): Promise<void> {
    if (this.persistDisabled) return;
    const tmp = join(dirname(this.stateFile), `.faucet-${randomUUID()}.tmp`);
    try {
      await mkdir(dirname(this.stateFile), { recursive: true });
      await writeFile(tmp, JSON.stringify(this.state), { mode: 0o600 });
      await rename(tmp, this.stateFile);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      this.persistDisabled = true;
      log.warn("faucet ledger persistence disabled; cap is process-local", {
        error: (err as Error).message,
      });
    }
  }
}

export function createFaucetLedger(config: AppConfig): FaucetLedger {
  return new FaucetLedger(config.faucet.stateFile, config.faucet.dailyCapSol, config.faucet.cooldownSeconds);
}
