#!/bin/sh
echo "=== Registry src directories ==="
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  echo "=== Registry: $(basename $d) ==="
  if [ -d "$d/cpufeatures-0.3.0" ]; then
    echo "Has cpufeatures-0.3.0"
    head -5 "$d/cpufeatures-0.3.0/Cargo.toml"
  else
    echo "No cpufeatures-0.3.0"
  fi
  if [ -d "$d/block-buffer-0.12.1" ]; then
    echo "Has block-buffer-0.12.1"
  else
    echo "No block-buffer-0.12.1"
  fi
done
echo "=== Cache directories ==="
for d in /usr/local/cargo/registry/cache/index.crates.io-*/; do
  echo "=== Cache: $(basename $d) ==="
  ls "$d/cpufeatures-0.3"* 2>/dev/null || echo "No cpufeatures"
  ls "$d/block-buffer-0.12"* 2>/dev/null || echo "No block-buffer"
done
