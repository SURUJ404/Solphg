#!/bin/sh
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  hash=$(basename "$d")
  f="$d/zeroize_derive-1.5.0/Cargo.toml"
  if [ -f "$f" ]; then
    echo "$hash: $(grep edition "$f")"
  else
    echo "$hash: not found"
  fi
done
echo "---"
for d in /usr/local/cargo/registry/cache/index.crates.io-*/; do
  hash=$(basename "$d")
  if [ -f "$d/zeroize_derive-1.5.0.crate" ]; then
    echo "$hash: crate exists"
  else
    echo "$hash: no crate"
  fi
done
