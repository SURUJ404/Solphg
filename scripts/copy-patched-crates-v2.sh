#!/bin/sh
set -e
src_cache="/usr/local/cargo/registry/cache/index.crates.io-1949cf8c6b5b557f"
dst_cache="/usr/local/cargo/registry/cache/index.crates.io-6f17d22bba15001f"
count=0
skipped=0
total=0
for crate in "$src_cache"/*.crate; do
  total=$((total + 1))
  name=$(basename "$crate")
  dst="$dst_cache/$name"
  if [ ! -f "$dst" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  src_ed=$(tar --wildcards -xzf "$crate" -O "*/Cargo.toml" 2>/dev/null | grep "^edition" | head -1)
  dst_ed=$(tar --wildcards -xzf "$dst" -O "*/Cargo.toml" 2>/dev/null | grep "^edition" | head -1)
  if [ "$src_ed" = 'edition = "2021"' ] && [ "$dst_ed" = 'edition = "2024"' ]; then
    cp "$crate" "$dst"
    echo "  Copied: $name"
    count=$((count + 1))
  fi
done
echo "=== Total: $total, Skipped (no dst): $skipped, Copied: $count ==="
