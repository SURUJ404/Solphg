#!/bin/sh
echo "=== constant_time_eq-0.4.2 CACHE ==="
for d in /usr/local/cargo/registry/cache/index.crates.io-*/; do
  h=$(basename "$d")
  ls "$d/constant_time_eq-0.4"* 2>/dev/null && echo "  found in $h" || echo "  none in $h"
done
echo "=== constant_time_eq-0.4.2 SRC ==="
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  h=$(basename "$d")
  f="$d/constant_time_eq-0.4.2/Cargo.toml"
  if [ -f "$f" ]; then
    echo "  $h: $(grep edition "$f")"
  else
    echo "  $h: not found"
  fi
done
