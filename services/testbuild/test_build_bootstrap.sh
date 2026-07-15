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
rustc --version
echo "=== Running anchor build with RUSTC_BOOTSTRAP=1 ==="
RUSTC_BOOTSTRAP=1 anchor build 2>&1
echo "=== Build exit: $? ==="
ls -la target/deploy/*.so 2>/dev/null || echo "No .so found"
