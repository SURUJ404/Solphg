#!/bin/sh
set -e

echo "=== STEP 1: Patching extracted src Cargo.toml files ==="
find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml" -type f 2>/dev/null | while read f; do
  if grep -q 'edition = "2024"' "$f" 2>/dev/null; then
    echo "  src: $f"
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
  fi
done

echo "=== STEP 2: Patching all .crate files (using --wildcards) ==="
count=0
for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  [ -f "$crate" ] || continue
  # Use --wildcards to find Cargo.toml at any depth
  if tar --wildcards -xzf "$crate" -O "*/Cargo.toml" 2>/dev/null | grep -q '^edition = "2024"'; then
    pkg=$(basename "$crate" .crate)
    echo "  PATCHING: $pkg"
    # Extract and re-pack using --wildcards to get the toplevel dir
    tmpdir=$(mktemp -d)
    tar -xzf "$crate" -C "$tmpdir"
    find "$tmpdir" -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \;
    # Determine top-level dir (first entry in tarball)
    toplevel=$(ls -A "$tmpdir" | head -1)
    (cd "$tmpdir" && tar -czf "$crate" "$toplevel")
    rm -rf "$tmpdir"
    count=$((count + 1))
  fi
done
echo "=== Patched $count .crate files ==="

echo "=== STEP 3: Verify ==="
find /usr/local/cargo/registry -type f \( -name "Cargo.toml" -o -name "*.crate" \) ! -name "*.orig" \
  -exec sh -c '
    case "$1" in
      *.crate)
        tar --wildcards -xzf "$1" -O "*/Cargo.toml" 2>/dev/null | grep -q "^edition = \"2024\"" && echo "$1"
        ;;
      *)
        grep -q "^edition = \"2024\"" "$1" 2>/dev/null && echo "$1"
        ;;
    esac
  ' _ {} \; 2>/dev/null || true
echo "=== Verification done ==="
