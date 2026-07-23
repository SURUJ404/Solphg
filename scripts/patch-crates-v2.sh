#!/bin/sh
set -e

echo "=== Finding and patching edition2024 in .crate files ==="
count=0
for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  [ -f "$crate" ] || continue
  # Use --wildcards to match Cargo.toml inside any directory
  edition=$(tar --wildcards -xzf "$crate" -O "*/Cargo.toml" 2>/dev/null | grep '^edition = "2024"' | head -1)
  if [ -n "$edition" ]; then
    pkg=$(basename "$crate" .crate)
    echo "Patching: $pkg"
    tmpdir=$(mktemp -d)
    tar -xzf "$crate" -C "$tmpdir"
    find "$tmpdir" -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    # Re-pack: get the top-level directory name
    pkgdir=$(ls -A "$tmpdir" | head -1)
    (cd "$tmpdir" && tar -czf "$crate" "$pkgdir")
    rm -rf "$tmpdir"
    count=$((count + 1))
  fi
done
echo "=== Patched $count .crate files ==="

echo "=== Patching extracted src dirs ==="
for src_dir in /usr/local/cargo/registry/src/index.crates.io-*/; do
  find "$src_dir" -name "Cargo.toml" -exec grep -l 'edition = "2024"' {} \; 2>/dev/null | while read f; do
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
    echo "  Patched: $f"
  done
done

echo "=== Done ==="
