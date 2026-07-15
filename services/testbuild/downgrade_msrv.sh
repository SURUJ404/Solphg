#!/bin/bash
# After generating a lockfile with cargo 1.85 + resolver=3, some packages
# may still require Rust > 1.75. This script iteratively downgrades them
# by running cargo build and parsing MSRV errors.
set -e
cd /tmp/fetch-deps

# Switch to 1.75 for MSRV-aware downgrades
rustup default 1.75.0 2>&1 >/dev/null

MAX_ITER=20
for i in $(seq 1 $MAX_ITER); do
  echo "=== MSRV resolution iteration $i ==="
  # Run cargo generate-lockfile to re-resolve if needed
  cargo generate-lockfile 2>&1
  
  # Check if there are any MSRV issues by running build (always fails)
  # Parse the error output for cargo update suggestions
  out=$(cargo check 2>&1 || true)
  
  # Check for "requires rustc" errors
  req_line=$(echo "$out" | grep "requires rustc" | head -1)
  if [ -z "$req_line" ]; then
    echo "=== No MSRV issues found ==="
    break
  fi
  
  # Extract package@version
  pkg_line=$(echo "$out" | grep "cannot be built" | head -1)
  echo "MSRV failure: $pkg_line"
  
  # Parse: "package `foo v1.2.3` cannot be built" -> extract "foo" and "1.2.3"
  pkg_info=$(echo "$pkg_line" | sed "s/.*package \`//" | sed "s/\` cannot be built.*//")
  pkg_name=$(echo "$pkg_info" | sed 's/ v.*//')
  pkg_ver=$(echo "$pkg_info" | sed 's/.* v//')
  
  echo "Downgrading $pkg_name (was $pkg_ver)..."
  
  # Use the suggestion from cargo if available
  suggest_ver=$(echo "$out" | grep "cargo update $pkg_name@" | head -1 | sed "s/.*--precise //")
  if [ -n "$suggest_ver" ]; then
    echo "Cargo suggests: $suggest_ver"
    cargo update -p "$pkg_name@$pkg_ver" --precise "$suggest_ver" 2>&1
  else
    # Try to find latest compatible version by scanning index
    echo "No suggestion, running cargo update to resolve..."
    # Just update the package to latest compatible version
    # This won't downgrade above MSRV but might help
    cargo update -p "$pkg_name" 2>&1 || true
  fi
done

# Restore lockfile format to v3
sed -i 's/^version = 4$/version = 3/' Cargo.lock 2>/dev/null || true
cp Cargo.lock /opt/anchor-lockfile

echo "=== Final lockfile saved ==="
