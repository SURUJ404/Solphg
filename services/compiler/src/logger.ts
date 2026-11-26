// Structured JSON logging with secret redaction. Never log request bodies;
// callers only pass request IDs, status codes and durations.
const SECRET_KEY_NAMES = new Set([
  "secretKey",
  "authoritySecretKey",
  "programKeypair",
  "faucetSecretKey",
  "FAUCET_SECRET_KEY",
  "adminToken",
  "ADMIN_TOKEN",
  "authorization",
  "cookie",
]);

const HEX_64_BYTES = /[0-9a-fA-F]{128}/g;
const BASE64_64_BYTES = /[A-Za-z0-9+/]{86}==/g;

export function redactText(value: string): string {
  return value
    .replace(HEX_64_BYTES, "[redacted-key]")
    .replace(BASE64_64_BYTES, "[redacted-key]");
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_NAMES.has(key) || /secret|keypair|token/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redact(inner);
      }
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: redactText(message),
    ...(redact(fields) as Record<string, unknown>),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
