import { PublicKey } from "@solana/web3.js";
import type { AppConfig } from "./config";

export const CLUSTERS = ["devnet", "testnet", "mainnet-beta"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const MAX_SO_BYTES = 4 * 1024 * 1024;
export const MAX_LOGS_CHARS = 100_000;
export const MAX_IDL_BYTES = 512 * 1024;

export function isValidAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function isValidSecretHex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{128}$/.test(value);
}

export function isCluster(value: unknown): value is Cluster {
  return typeof value === "string" && (CLUSTERS as readonly string[]).includes(value);
}

export function resolveRpc(cluster: Cluster, config: AppConfig): string {
  switch (cluster) {
    case "devnet":
      return config.devnetRpcUrl;
    case "testnet":
      return "https://api.testnet.solana.com";
    case "mainnet-beta":
      return config.mainnetRpcUrl;
  }
}

export function decodeBase64Bounded(value: unknown, maxBytes: number): Buffer | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // Reject whitespace and non-base64 characters up front.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const approxBytes = Math.floor((value.length * 3) / 4);
  if (approxBytes > maxBytes) return null;
  const buf = Buffer.from(value, "base64");
  if (buf.length === 0 || buf.length > maxBytes) return null;
  return buf;
}

export function parseSolAmount(value: unknown, maxSol: number): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > maxSol) return null;
  // Cap to 9 decimal places (lamport precision).
  return Math.round(n * 1e9) / 1e9;
}

export function safeTokenEqual(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function firstErrorLine(stderr: string, stdout: string): string {
  const text = (stderr || stdout || "").trim();
  if (!text) return "command failed with no output";
  return text.split("\n").find((l) => l.trim().length > 0)?.trim().slice(0, 500) ?? "command failed";
}
