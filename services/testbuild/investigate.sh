#!/bin/bash
echo "=== Hybrid-array in Solana SDK ==="
find /root/.local/share/solana/install/active_release/bin/sdk/ -name "Cargo.toml" -exec grep -l "hybrid-array" {} \; 2>/dev/null

echo "=== Solana SDK deps ==="
cat /root/.local/share/solana/install/active_release/bin/sdk/sbf/dependencies/program-crate/Cargo.toml 2>/dev/null || true

echo "=== SBF scripts ==="
ls /root/.local/share/solana/install/active_release/bin/sdk/sbf/scripts/

echo "=== Cargo-build-sbf verbose test ==="
cd /tmp && mkdir -p test_sbf/src && echo 'fn main() {}' > test_sbf/src/main.rs && cat > test_sbf/Cargo.toml << 'EOF'
[package]
name = "test_sbf"
version = "0.1.0"
edition = "2021"
EOF
RUSTC_BOOTSTRAP=1 cargo-build-sbf --verbose -- --offline 2>&1 | head -50 || true

echo "=== Binary search for bootstrap in cargo-build-sbf ==="
strings /root/.local/share/solana/install/active_release/bin/cargo-build-sbf 2>/dev/null | grep -i "RUSTC_BOOT\|bootstrap\|nightly" | head -10
