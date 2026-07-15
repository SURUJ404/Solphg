#!/bin/sh
echo "=== zeroize_derive-1.5.0 in 6f17d22bba15001f ==="
tar --wildcards -xzf /usr/local/cargo/registry/cache/index.crates.io-6f17d22bba15001f/zeroize_derive-1.5.0.crate -O "*/Cargo.toml" 2>/dev/null | grep edition
echo "=== zeroize_derive-1.5.0 in 1949cf8c6b5b557f ==="
tar --wildcards -xzf /usr/local/cargo/registry/cache/index.crates.io-1949cf8c6b5b557f/zeroize_derive-1.5.0.crate -O "*/Cargo.toml" 2>/dev/null | grep edition
