// Server-side Anchor scaffolding. The API owns Anchor.toml/Cargo.toml so a
// caller cannot smuggle build scripts or extra crates into the toolchain.
// Keep this in lockstep with packages/plugin-manager/src/templates.ts.

export const ANCHOR_VERSION = "0.31.1";
export const SOLANA_VERSION = "2.2.7";
export const RUST_VERSION = "1.86.0";

export interface ProgramCargoOptions {
  /** Add anchor-spl and its idl-build feature (required by SPL templates). */
  usesAnchorSpl?: boolean;
}

export function anchorToml(programName: string, programId = "11111111111111111111111111111111", cluster = "Localnet"): string {
  return `[features]
resolution = true
skip-lint = false

[programs.localnet]
${programName} = "${programId}"

[provider]
cluster = "${cluster}"
wallet = "~/.config/solana/id.json"

[scripts]
test = "echo no-op"

[toolchain]
anchor_version = "${ANCHOR_VERSION}"
`;
}

export function workspaceCargoToml(): string {
  return `[workspace]
members = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
`;
}

export function programCargoToml(programName: string, options: ProgramCargoOptions = {}): string {
  const pkgName = programName.replace(/-/g, "_");
  const splDeps = options.usesAnchorSpl ? `anchor-spl = "${ANCHOR_VERSION}"\n` : "";
  const idlBuild = options.usesAnchorSpl
    ? `idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]`
    : `idl-build = ["anchor-lang/idl-build"]`;
  return `[package]
name = "${pkgName}"
version = "0.1.0"
description = "Created with Solphg"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${pkgName}"
path = "src/lib.rs"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
${idlBuild}

[dependencies]
anchor-lang = "${ANCHOR_VERSION}"
${splDeps}`;
}

export function xargoToml(): string {
  // Anchor's toolchain expects this at the workspace root in some setups; harmless if unused.
  return `[target.bpfel-unknown-unknown.dependencies.std]
features = []
`;
}
