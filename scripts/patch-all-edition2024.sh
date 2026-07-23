#!/bin/sh
set -e

patch_src() {
  local f="$1"
  if [ -f "$f" ] && grep -q 'edition = "2024"' "$f" 2>/dev/null; then
    echo "  src: $f"
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
  fi
}

echo "=== STEP 1: Patching all extracted src Cargo.toml files ==="
for src_dir in /usr/local/cargo/registry/src/index.crates.io-*/; do
  hash=$(basename "$src_dir")
  echo "--- $hash ---"
  find "$src_dir" -name "Cargo.toml" -type f | sort | while read f; do
    patch_src "$f"
  done
done

echo ""
echo "=== STEP 2: Patching all .crate files ==="
count=0
for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  [ -f "$crate" ] || continue
  pkg=$(basename "$crate" .crate)
  # Extract Cargo.toml, check for edition2024 (no --wildcards needed, use exact path)
  pkgname=$(echo "$pkg" | sed 's/-[0-9].*//' | sed 's/+/%2B/g')
  # Actually, try to get the directory name from the tarball
  toplevel=$(tar -tzf "$crate" 2>/dev/null | head -1 | cut -d/ -f1)
  if [ -z "$toplevel" ]; then
    echo "  SKIP (empty tarball): $pkg"
    continue
  fi
  edition=$(tar -xzf "$crate" -O "$toplevel/Cargo.toml" 2>/dev/null | grep '^edition = "2024"' | head -1)
  if [ -n "$edition" ]; then
    echo "  PATCH: $pkg ($toplevel)"
    tmpdir=$(mktemp -d)
    tar -xzf "$crate" -C "$tmpdir"
    sed -i 's/edition = "2024"/edition = "2021"/' "$tmpdir/$toplevel/Cargo.toml"
    [ -f "$tmpdir/$toplevel/Cargo.toml.orig" ] && sed -i 's/edition = "2024"/edition = "2021"/' "$tmpdir/$toplevel/Cargo.toml.orig"
    (cd "$tmpdir" && tar -czf "$crate" "$toplevel")
    rm -rf "$tmpdir"
    count=$((count + 1))
  fi
done
echo "=== Patched $count .crate files ==="

echo ""
echo "=== STEP 3: Verify no Cargo.toml has edition2024 ==="
remaining=$(find /usr/local/cargo/registry -type f -name "Cargo.toml" -not -name "*.orig" -exec grep -l '^edition = "2024"' {} \; 2>/dev/null || true)
if [ -z "$remaining" ]; then
  echo "ALL PATCHED SUCCESSFULLY"
else
  echo "REMAINING:"
  echo "$remaining"
  exit 1
fi

remaining_crate=$(for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do
  [ -f "$crate" ] || continue
  toplevel=$(tar -tzf "$crate" 2>/dev/null | head -1 | cut -d/ -f1)
  [ -n "$toplevel" ] || continue
  tar -xzf "$crate" -O "$toplevel/Cargo.toml" 2>/dev/null | grep -q '^edition = "2024"' && basename "$crate" .crate
done)
if [ -z "$remaining_crate" ]; then
  echo "ALL .crate files patched successfully"
else
  echo "REMAINING in .crate:"
  echo "$remaining_crate"
  exit 1
fi
