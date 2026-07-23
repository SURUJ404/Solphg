#!/bin/sh
set -e
TEST_DIR=/tmp/test-anchor-build
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR/programs/my_counter/src"

cat > "$TEST_DIR/Anchor.toml" << 'TOML'
[toolchain]
anchor_version = "0.30.1"
[programs.localnet]
my_counter = "11111111111111111111111111111111"
[provider]
cluster = "localnet"
wallet = "/root/.config/solana/id.json"
TOML

cat > "$TEST_DIR/Cargo.toml" << 'TOML'
[workspace]
members = ["programs/*"]
resolver = "2"
[profile.release]
overflow-checks = true
TOML

cat > "$TEST_DIR/programs/my_counter/Cargo.toml" << 'TOML'
[package]
name = "my_counter"
version = "0.1.0"
edition = "2021"
[lib]
crate-type = ["cdylib", "lib"]
[dependencies]
anchor-lang = "0.30.1"
TOML

cat > "$TEST_DIR/programs/my_counter/src/lib.rs" << 'RUST'
use anchor_lang::prelude::*;
declare_id!("11111111111111111111111111111111");
#[program]
pub mod my_counter {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}
#[derive(Accounts)]
pub struct Initialize {}
RUST

# Copy lockfile
cp /opt/anchor-lockfile "$TEST_DIR/Cargo.lock"

cd "$TEST_DIR"
echo "Running: anchor build -- --offline"
anchor build -- --offline 2>&1
echo "=== Exit: $? ==="
ls -la target/deploy/ 2>/dev/null || echo "no deploy dir"
