#!/bin/sh
LOCK_DIR=/tmp/anchor-lock-gen2
rm -rf "$LOCK_DIR"
mkdir -p "$LOCK_DIR/programs/test/src"

cat > "$LOCK_DIR/Anchor.toml" << 'TOML'
[toolchain]
anchor_version = "0.30.1"
[programs.localnet]
test = "11111111111111111111111111111111"
[provider]
cluster = "localnet"
wallet = "/root/.config/solana/id.json"
TOML

cat > "$LOCK_DIR/Cargo.toml" << 'TOML'
[workspace]
members = ["programs/*"]
resolver = "2"
[profile.release]
overflow-checks = true
TOML

cat > "$LOCK_DIR/programs/test/Cargo.toml" << 'TOML'
[package]
name = "test"
version = "0.1.0"
edition = "2021"
[lib]
crate-type = ["cdylib", "lib"]
[dependencies]
anchor-lang = "0.30.1"
TOML

cat > "$LOCK_DIR/programs/test/src/lib.rs" << 'RUST'
use anchor_lang::prelude::*;
declare_id!("11111111111111111111111111111111");
#[program]
pub mod test {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}
#[derive(Accounts)]
pub struct Initialize {}
RUST

cd "$LOCK_DIR" && cargo generate-lockfile 2>&1
cp Cargo.lock /opt/anchor-lockfile
echo "=== Lockfile ==="
head -3 /opt/anchor-lockfile
echo "=== cpufeatures versions ==="
grep -A1 'name = "cpufeatures"' /opt/anchor-lockfile
echo "=== block-buffer versions ==="
grep -A1 'name = "block-buffer"' /opt/anchor-lockfile
