#!/bin/sh
set -e
cp /tmp/lockfile-gen2/Cargo.lock /opt/anchor-lockfile
sed -i 's/version = 4/version = 3/' /opt/anchor-lockfile
head -3 /opt/anchor-lockfile
echo "Lockfile updated OK"
