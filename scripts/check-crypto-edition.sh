#!/bin/sh
echo "=== crypto-common-0.2.2 in 6f17d22bba15001f ==="
cat /usr/local/cargo/registry/src/index.crates.io-6f17d22bba15001f/crypto-common-0.2.2/Cargo.toml | head -10
echo ""
echo "=== grepping edition ==="
grep 'edition' /usr/local/cargo/registry/src/index.crates.io-6f17d22bba15001f/crypto-common-0.2.2/Cargo.toml
