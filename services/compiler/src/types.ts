export interface FileInput {
  // Relative path inside the program's src/ folder, e.g. "lib.rs" or "instructions/init.rs"
  path: string;
  content: string;
}

export interface BuildRequest {
  // Rust crate / program name, e.g. "my_counter". Must be a valid Rust identifier.
  programName: string;
  files: FileInput[];
  // Optional extra anchor-lang / dependency versions could go here later.
}

export interface BuildResult {
  success: boolean;
  logs: string;
  // Base64-encoded compiled .so program, present only on success
  program?: string;
  // Anchor-generated IDL describing instructions + accounts, present only on success
  idl?: unknown;
  // Program ID generated for this build (from target/deploy/<name>-keypair.json)
  programId?: string;
  error?: string;
}
