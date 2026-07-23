#!/bin/sh
count=0
for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  if [ -f "$crate" ]; then
    if zcat "$crate" 2>/dev/null | head -100 | grep -q 'edition = "2024"'; then
      basename "$crate" .crate
      count=$((count + 1))
    fi
  fi
done
echo "=== Total with edition2024: $count ==="
