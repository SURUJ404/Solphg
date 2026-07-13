export function anchorToml(programName: string): string {
  return `[features]
seeds = false
skip-lint = false

[programs.localnet]
${programName} = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "/root/.config/solana/id.json"

[scripts]
test = "echo no-op"
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

export function programCargoToml(programName: string): string {
  return `[package]
name = "${programName}"
version = "0.1.0"
description = "Created with Solshift"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${programName}"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
`;
}

export function xargoToml(): string {
  // Anchor's toolchain expects this at the workspace root in some setups; harmless if unused.
  return `[target.bpfel-unknown-unknown.dependencies.std]
features = []
`;
}
