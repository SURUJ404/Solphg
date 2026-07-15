#!/bin/bash
echo "=== Lockfile version ==="
head -5 /opt/anchor-lockfile
echo "=== cmov ==="
grep -A3 'name = "cmov"' /opt/anchor-lockfile
echo "=== block-buffer ==="
grep -A3 'name = "block-buffer"' /opt/anchor-lockfile
echo "=== indexmap ==="
grep -A3 'name = "indexmap"' /opt/anchor-lockfile
echo "=== wasip2 ==="
grep -A3 'name = "wasip2"' /opt/anchor-lockfile
echo "=== getrandom ==="
grep -A3 'name = "getrandom"' /opt/anchor-lockfile
echo "=== wasip2 in 1.75 index ==="
find /usr/local/cargo/registry/index/index.crates.io-6f17d22bba15001f/ -name "was*" -type f 2>/dev/null | head -5
echo "=== wasip2 in 1.85 index ==="
find /usr/local/cargo/registry/index/index.crates.io-1949cf8c6b5b557f/ -name "was*" -type f 2>/dev/null | head -5
