#!/bin/sh
set -e

echo "=== Checking and patching all .crate files ==="
count=0
checked=0
for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  [ -f "$crate" ] || continue
  checked=$((checked + 1))
  # Dump Cargo.toml, check edition
  content=$(tar --wildcards -xzf "$crate" -O "*/Cargo.toml" 2>/dev/null)
  if echo "$content" | grep -q '^edition = "2024"'; then
    pkg=$(basename "$crate" .crate)
    echo "Patching: $pkg ($(dirname "$crate"))"
    tmpdir=$(mktemp -d)
    tar -xzf "$crate" -C "$tmpdir"
    find "$tmpdir" -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    pkgdir=$(ls -A "$tmpdir" | head -1)
    (cd "$tmpdir" && tar -czf "$crate" "$pkgdir")
    rm -rf "$tmpdir"
    count=$((count + 1))
  fi
done
echo "=== Checked $checked crates, patched $count ==="

echo "=== Patching extracted src dirs ==="
for src_dir in /usr/local/cargo/registry/src/index.crates.io-*/; do
  find "$src_dir" -name "Cargo.toml" -exec grep -l 'edition = "2024"' {} \; 2>/dev/null | while read f; do
    echo "  Patched src: $f"
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
  done
done
echo "=== Done ==="
