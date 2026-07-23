#!/bin/sh
set -e
crate="/usr/local/cargo/registry/cache/index.crates.io-6f17d22bba15001f/cmov-0.5.4.crate"
echo "=== Testing tar -tzf ==="
tar -tzf "$crate" 2>&1 | head -3
echo "=== Getting toplevel ==="
result=$(tar -tzf "$crate" 2>&1 | head -1 | cut -d/ -f1)
echo "RESULT: '$result'"
