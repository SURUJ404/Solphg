#!/bin/bash
set -e
SRC="/testbuild"
TGT="/tmp/testbuild"
mkdir -p "$TGT/programs/test/src"
cp "$SRC/Anchor.toml" "$TGT/"
cp "$SRC/Cargo.toml" "$TGT/"
cp "$SRC/programs/test/Cargo.toml" "$TGT/programs/test/"
cp "$SRC/programs/test/src/lib.rs" "$TGT/programs/test/src/"

cd "$TGT"

FEATURES="error_in_core,const_mut_refs,ptr_from_ref,diagnostic_namespace,const_slice_from_raw_parts_mut,const_option,const_array_from_ref,raw_ref_op,inline_const,slice_split_at_unchecked,const_refs_to_cell"
export CARGO_TARGET_SBF_SOLANA_SOLANA_RUSTFLAGS="-Zcrate-attr=feature($FEATURES)"

TOOLCHAIN_PATH="/root/.local/share/solana/install/active_release/bin/sdk/sbf/dependencies/platform-tools/rust"
echo "=== Linking solana toolchain ==="
rustup toolchain link solana "$TOOLCHAIN_PATH"
rustup run solana rustc --version
echo "=== Running cargo +solana build --release ==="
cargo +solana build --release --target sbf-solana-solana --offline 2>&1
echo "=== Build exit: $? ==="
ls -la target/sbf-solana-solana/release/*.so 2>/dev/null || echo "No .so"
