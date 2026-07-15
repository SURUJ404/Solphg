#!/bin/bash
set -e
SRC="/testbuild"
TGT="/tmp/testbuild"
mkdir -p "$TGT/programs/test/src"
cp "$SRC/Anchor.toml" "$TGT/"
cp "$SRC/Cargo.toml" "$TGT/"
cp "$SRC/programs/test/Cargo.toml" "$TGT/programs/test/"
cp "$SRC/programs/test/src/lib.rs" "$TGT/programs/test/src/"
cp /opt/anchor-lockfile "$TGT/Cargo.lock"
cd "$TGT"
echo "=== cargo build-sbf ==="
cargo build-sbf -- --offline 2>&1
echo "=== exit: $? ==="
ls -la target/deploy/*.so 2>/dev/null || echo "No .so"
echo "=== done ==="
