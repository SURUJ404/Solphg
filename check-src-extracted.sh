#!/bin/sh
for d in /usr/local/cargo/registry/src/index.crates.io-*/; do
  hash="$(basename $d)"
  echo "=== $hash ==="
  ls "$d/" 2>/dev/null | grep -i "crypto-common" || echo "No crypto-common extracted"
  ls "$d/" 2>/dev/null | grep -i "getrandom-0\." || echo "No getrandom extracted"
done
echo "=== Cache ==="
for d in /usr/local/cargo/registry/cache/index.crates.io-*/; do
  hash="$(basename $d)"
  echo "=== $hash ==="
  ls "$d/" 2>/dev/null | grep "crypto-common-0.2.2" || echo "No crypto-common-0.2.2"
done
