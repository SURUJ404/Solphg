#!/bin/sh
set -e
src_cache="/usr/local/cargo/registry/cache/index.crates.io-1949cf8c6b5b557f"
dst_cache="/usr/local/cargo/registry/cache/index.crates.io-6f17d22bba15001f"
src_src="/usr/local/cargo/registry/src/index.crates.io-1949cf8c6b5b557f"
dst_src="/usr/local/cargo/registry/src/index.crates.io-6f17d22bba15001f"

echo "=== Removing all extracted src directories from target ==="
for d in "$dst_src"/*/; do
  name=$(basename "$d")
  if [ -d "$src_src/$name" ]; then
    echo "  Removing: $name"
    rm -rf "$d"
  fi
done

echo "=== Copying .crate files from source cache to target ==="
count=0
for crate in "$src_cache"/*.crate; do
  name=$(basename "$crate")
  dst="$dst_cache/$name"
  src_ed=$(tar --wildcards -xzf "$crate" -O "*/Cargo.toml" 2>/dev/null | grep "^edition" | head -1)
  if [ "$src_ed" = 'edition = "2021"' ]; then
    cp "$crate" "$dst"
    echo "  Copied: $name"
    count=$((count + 1))
  fi
done
echo "=== Copied $count .crate files ==="
