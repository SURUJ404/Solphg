#!/bin/sh
echo "Patching edition2024 crate Cargo.toml files..."
for src_dir in /usr/local/cargo/registry/src/index.crates.io-*/; do
  find "$src_dir" -name "Cargo.toml" -exec grep -l 'edition = "2024"' {} \; 2>/dev/null | while read f; do
    echo "Patching: $f"
    sed -i 's/edition = "2024"/edition = "2021"/' "$f"
  done
done
echo "=== crates still with 2024 ==="
grep -r 'edition = "2024"' /usr/local/cargo/registry/src/index.crates.io-*/ 2>/dev/null || echo "None found"
echo "Done"
