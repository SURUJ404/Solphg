#!/bin/sh
echo "=== Edition field in cpufeatures-0.3.0 Cargo.toml ==="
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  f="$d/cpufeatures-0.3.0/Cargo.toml"
  if [ -f "$f" ]; then
    echo "--- $(basename $d) ---"
    grep -i 'edition' "$f" 2>/dev/null || echo "No edition field"
  fi
done
echo ""
echo "=== Edition field in block-buffer-0.12.1 Cargo.toml ==="
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  f="$d/block-buffer-0.12.1/Cargo.toml"
  if [ -f "$f" ]; then
    echo "--- $(basename $d) ---"
    grep -i 'edition' "$f" 2>/dev/null || echo "No edition field"
  fi
done
