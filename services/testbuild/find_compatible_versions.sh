#!/bin/bash
# Find the latest version of a package that has rust-version <= 1.75
# Usage: find_compatible_versions.sh <package_name> <cache_hash>
PKG="$1"
HASH="$2"

INDEX_DIR="/usr/local/cargo/registry/index/index.crates.io-$HASH"
CACHE_DIR="/usr/local/cargo/registry/cache/index.crates.io-$HASH"

# Find the index file for this package
# First letter of the package name
FIRST="${PKG:0:1}"
# Second letter (or fallback)
if [ ${#PKG} -ge 3 ]; then
  SECOND="${PKG:1:1}"
else
  SECOND="$FIRST"
fi

INDEX_FILE=$(find "$INDEX_DIR" -name "$PKG" -type f 2>/dev/null | head -1)
if [ -z "$INDEX_FILE" ]; then
  INDEX_FILE=$(find "$INDEX_DIR" -name "$PKG" -path "*${FIRST}/${SECOND}*" -type f 2>/dev/null | head -1)
fi

if [ -z "$INDEX_FILE" ]; then
  echo "Index file not found for $PKG"
  exit 1
fi

echo "=== Compatible versions for $PKG ==="
# Parse index file - each line is a JSON object with version, yank, etc.
while IFS= read -r line; do
  ver=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('v',''))" 2>/dev/null || echo "")
  yanked=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('yanked',False))" 2>/dev/null || echo "false")
  msrv=$(echo "$line" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read())
if 'rust_version' in d and d['rust_version']:
  print(d['rust_version'])
else:
  print('')
" 2>/dev/null || echo "")
  
  if [ "$yanked" = "false" ] || [ "$yanked" = "False" ] || [ "$yanked" = "0" ]; then
    if [ -z "$msrv" ]; then
      echo "$ver (no MSRV field - assumed compatible)"
    else
      echo "$ver (MSRV: $msrv)"
    fi
  fi
done < "$INDEX_FILE"
