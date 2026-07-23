#!/bin/sh
set -e

echo "=== Patching edition2024 in ALL .crate files ==="

for cache_dir in /usr/local/cargo/registry/cache/index.crates.io-*/; do
  for crate in "$cache_dir"*.crate; do
    [ -f "$crate" ] || continue
    basename "$crate" | sed 's/\.crate$//'
    # Check if the .crate contains edition = "2024"
    if zcat "$crate" 2>/dev/null | head -100 | grep -q 'edition = "2024"'; then
      echo "  Patching: $(basename "$crate")"
      # Create a temp dir
      tmpdir=$(mktemp -d)
      # Extract and patch
      tar -xzf "$crate" -C "$tmpdir"
      find "$tmpdir" -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
      find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
      # Re-pack
      (cd "$tmpdir" && tar -czf "$crate" -- * 2>/dev/null)
      rm -rf "$tmpdir"
    fi
  done
done

echo "=== Patching edition2024 in extracted src dirs ==="
for src_dir in /usr/local/cargo/registry/src/index.crates.io-*/; do
  find "$src_dir" -name "Cargo.toml" -exec grep -l 'edition = "2024"' {} \; 2>/dev/null | while read f; do
    echo "  Patching: $f"
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
  done
done

echo "=== Verification ==="
remaining=$(find /usr/local/cargo/registry -name "*.toml" -not -name "*.orig" -exec grep -l 'edition = "2024"' {} \; 2>/dev/null || true)
if [ -z "$remaining" ]; then
  echo "All patched successfully!"
else
  echo "Remaining files with edition2024:"
  echo "$remaining"
fi
