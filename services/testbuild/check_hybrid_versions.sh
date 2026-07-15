#!/bin/bash
# Check available versions using grep on index cache files
HASH="1949cf8c6b5b557f"
INDEX_DIR="/usr/local/cargo/registry/index/index.crates.io-$HASH"

echo "=== hybrid-array ==="
grep -o '"v":"[^"]*"' "$INDEX_DIR/.cache/hy/br/hybrid-array" 2>/dev/null | sed 's/"v":"//;s/"//' | head -20

echo "=== cmov ==="
grep -o '"v":"[^"]*"' "$INDEX_DIR/.cache/cm/ov/cmov" 2>/dev/null | sed 's/"v":"//;s/"//' | head -20

echo "=== constant_time_eq ==="
grep -o '"v":"[^"]*"' "$INDEX_DIR/.cache/co/ns/constant_time_eq" 2>/dev/null | sed 's/"v":"//;s/"//' | head -20
