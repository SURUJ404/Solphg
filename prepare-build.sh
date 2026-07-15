#!/bin/sh
set -e

echo "=== Switch to cargo 1.85 ==="
rustup default 1.85.1 2>&1 | tail -1

echo "=== cargo fetch --locked ==="
cd /tmp/lockfile-gen2
cargo fetch --locked 2>&1
echo "=== fetch done ==="

echo "=== Sync caches ==="
/tmp/sync-caches.sh

echo "=== Restore lockfile to /opt/anchor-lockfile (v3) ==="
cp /tmp/lockfile-gen2/Cargo.lock /opt/anchor-lockfile
sed -i 's/version = 4/version = 3/' /opt/anchor-lockfile
head -3 /opt/anchor-lockfile
echo "=== Ready ==="
