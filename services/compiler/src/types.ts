export interface FileInput {
  // Relative path inside the program's src/ folder, e.g. "lib.rs" or "instructions/init.rs"
  path: string;
  content: string;
}

export interface BuildRequest {
  // Rust crate / program name, e.g. "my_counter". Must be a valid Rust identifier.
  programName: string;
  files: FileInput[];
  // Optional program ID the client already owns. When provided the service
  // syncs `declare_id!` to it and the build is cacheable. When omitted a new
  // program keypair is generated for this request and returned to the caller.
  programId?: string;
}

export interface BuildResult {
  success: boolean;
  logs: string;
  // Base64-encoded compiled .so program, present only on success
  program?: string;
  // Anchor-generated IDL describing instructions + accounts, present only on success
  idl?: unknown;
  // Program ID the binary was compiled for
  programId?: string;
  // Base64-encoded program keypair bytes. Only returned when the service
  // generated the keypair for this request; never stored in the cache.
  programKeypair?: string;
  // Cache metadata
  cached?: boolean;
  cacheKey?: string;
  durationMs?: number;
  // Machine-readable failure code, e.g. BUILD_QUEUE_FULL / BUILD_TIMEOUT
  code?: string;
  retryAfterSec?: number;
  error?: string;
}
