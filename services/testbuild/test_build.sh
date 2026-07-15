#!/bin/bash
set -e
mkdir -p /tmp/testbuild/programs/test/src
cp /opt/anchor-lockfile /tmp/testbuild/Cargo.lock
cp /services/testbuild/Anchor.toml /tmp/testbuild/
cp /services/testbuild/Cargo.toml /tmp/testbuild/
cp /services/testbuild/programs/test/Cargo.toml /tmp/testbuild/programs/test/
cp /services/testbuild/programs/test/src/lib.rs /tmp/testbuild/programs/test/src/
cd /tmp/testbuild
rustup default 1.75.0 2>&1
echo "=== Running anchor build ==="
anchor build -- --offline 2>&1
echo "=== Build exit: $? ==="
ldd target/deploy/*.so 2>/dev/null || true
ls -la target/deploy/*.so 2>/dev/null || echo "No .so found"
rustup default 1.85.1 2>&1 >/dev/null
