export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  corsOrigins: string[];
  trustProxyHops: number;
  maxConcurrentBuilds: number;
  buildTimeoutMs: number;
  maxConcurrentOps: number;
  rateLimits: {
    global: number;
    build: number;
    deploy: number;
    airdrop: number;
    write: number;
    windowMs: number;
  };
  quotaWindowMs: number;
  quotas: { build: number; deploy: number };
  bodyLimit: string;
  faucet: {
    secretHex: string;
    address: string;
    stateFile: string;
    maxSolPerRequest: number;
    dailyCapSol: number;
    cooldownSeconds: number;
  };
  devnetRpcUrl: string;
  mainnetRpcUrl: string;
  adminToken: string;
  enableLocalValidator: boolean;
  toolchainTag: string;
}

const CLUSTER_SAFE_URL = /^https:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/;

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function httpsUrlEnv(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = env[name] || fallback;
  if (!CLUSTER_SAFE_URL.test(raw)) {
    throw new Error(`${name} must be an https:// URL`);
  }
  return raw;
}

function parseOrigins(raw?: string): string[] {
  return (raw || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function bodyLimitEnv(env: NodeJS.ProcessEnv): string {
  const raw = env.BODY_LIMIT || "8mb";
  if (!/^\d{1,3}(kb|mb)$/i.test(raw)) {
    throw new Error("BODY_LIMIT must look like 512kb or 8mb");
  }
  const amount = parseInt(raw, 10);
  const bytes = /mb$/i.test(raw) ? amount * 1024 * 1024 : amount * 1024;
  if (bytes > 16 * 1024 * 1024) throw new Error("BODY_LIMIT must be at most 16mb");
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const secretHex = (env.FAUCET_SECRET_KEY || "").trim();
  if (secretHex && !/^[0-9a-fA-F]{128}$/.test(secretHex)) {
    throw new Error("FAUCET_SECRET_KEY must be 128 hex characters (64 bytes)");
  }

  const corsRaw = env.CORS_ORIGIN;
  if (isProduction && !corsRaw) {
    throw new Error("CORS_ORIGIN must be set in production (comma-separated https origins)");
  }
  const corsOrigins = parseOrigins(corsRaw);
  for (const origin of corsOrigins) {
    if (origin === "*" || origin.includes("*")) {
      throw new Error("CORS_ORIGIN must not contain wildcards");
    }
    if (isProduction && !/^https:\/\//.test(origin)) {
      throw new Error(`CORS_ORIGIN entry must be https:// in production: ${origin}`);
    }
  }

  const windowMs = intEnv(env, "RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 3_600_000);
  const globalLimit = intEnv(env, "RATE_LIMIT_MAX", 120, 1, 100_000);
  const trustProxyHops = intEnv(env, "TRUST_PROXY_HOPS", isProduction ? 1 : 0, 0, 10);
  if (isProduction && trustProxyHops === 0) {
    // Without a trusted proxy hop every client appears to share the proxy IP,
    // so per-IP rate limits and quotas would be ineffective (or lock everyone out).
    throw new Error("TRUST_PROXY_HOPS must be >= 1 in production");
  }

  return {
    port: intEnv(env, "PORT", 8080, 1, 65_535),
    nodeEnv,
    isProduction,
    corsOrigins,
    trustProxyHops,
    maxConcurrentBuilds: intEnv(env, "MAX_CONCURRENT_BUILDS", 2, 1, 64),
    buildTimeoutMs: intEnv(env, "BUILD_TIMEOUT_MS", 180_000, 5_000, 900_000),
    maxConcurrentOps: intEnv(env, "MAX_CONCURRENT_OPS", 3, 1, 64),
    rateLimits: {
      global: globalLimit,
      build: intEnv(env, "RATE_LIMIT_BUILD_MAX", 6, 1, 10_000),
      deploy: intEnv(env, "RATE_LIMIT_DEPLOY_MAX", 15, 1, 10_000),
      airdrop: intEnv(env, "RATE_LIMIT_AIRDROP_MAX", 5, 1, 10_000),
      write: intEnv(env, "RATE_LIMIT_WRITE_MAX", 60, 1, 10_000),
      windowMs,
    },
    quotaWindowMs: intEnv(env, "QUOTA_WINDOW_MS", 3_600_000, 60_000, 86_400_000),
    quotas: {
      build: intEnv(env, "BUILD_QUOTA_MAX", 60, 1, 100_000),
      deploy: intEnv(env, "DEPLOY_QUOTA_MAX", 10, 1, 100_000),
    },
    bodyLimit: bodyLimitEnv(env),
    faucet: {
      secretHex,
      address: (env.FAUCET_ADDRESS || "").trim(),
      stateFile: env.FAUCET_STATE_FILE || (isProduction ? "/var/lib/solphg/faucet-state.json" : "/tmp/solphg-faucet-state.json"),
      maxSolPerRequest: intEnv(env, "FAUCET_MAX_SOL_PER_REQUEST", 2, 1, 100),
      dailyCapSol: intEnv(env, "FAUCET_DAILY_CAP_SOL", 50, 1, 100_000),
      cooldownSeconds: intEnv(env, "FAUCET_COOLDOWN_SECONDS", 3_600, 0, 86_400 * 7),
    },
    devnetRpcUrl: httpsUrlEnv(env, "DEVNET_RPC_URL", "https://api.devnet.solana.com"),
    mainnetRpcUrl: httpsUrlEnv(env, "MAINNET_RPC_URL", "https://api.mainnet-beta.solana.com"),
    adminToken: (env.ADMIN_TOKEN || "").trim(),
    enableLocalValidator: env.ENABLE_LOCAL_VALIDATOR === "true",
    toolchainTag: env.TOOLCHAIN_TAG || "anchor-0.31.1-agave-2.2.7-rust-1.86.0",
  };
}
