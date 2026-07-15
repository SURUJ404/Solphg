#!/bin/bash
set -e
mkdir -p /tmp/testbuild/programs/test/src
cp /opt/anchor-lockfile /tmp/testbuild/Cargo.lock
cp /services/testbuild/Anchor.toml /tmp/testbuild/
cp /services/testbuild/Cargo.toml /tmp/testbuild/
cp /services/testbuild/programs/test/Cargo.toml /tmp/testbuild/programs/test/
cp /services/testbuild/programs/test/src/lib.rs /tmp/testbuild/programs/test/src/
cd /tmp/testbuild
echo "=== Rust version ==="
rustup default 1.85.1 2>&1
rustc --version
echo "=== Running anchor build ==="
# Try without --offline first (network might be available)
anchor build 2>&1
echo "=== Build exit: $? ==="
ls -la target/deploy/*.so 2>/dev/null || echo "No .so found"
