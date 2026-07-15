#!/bin/sh
set -e
src_cache="/usr/local/cargo/registry/cache/index.crates.io-1949cf8c6b5b557f"
dst_cache="/usr/local/cargo/registry/cache/index.crates.io-6f17d22bba15001f"

echo "Checking toml_datetime..."
crate="toml_datetime-1.1.1+spec-1.1.0.crate"
src="$src_cache/$crate"
dst="$dst_cache/$crate"
echo "src exists: $(test -f "$src" && echo yes || echo no)"
echo "dst exists: $(test -f "$dst" && echo yes || echo no)"

src_ed=$(tar --wildcards -xzf "$src" -O "*/Cargo.toml" 2>/dev/null | grep "^edition" | head -1)
dst_ed=$(tar --wildcards -xzf "$dst" -O "*/Cargo.toml" 2>/dev/null | grep "^edition" | head -1)
echo "src edition: [$src_ed]"
echo "dst edition: [$dst_ed]"
echo ""

if [ "$src_ed" = 'edition = "2021"' ]; then echo "src matches 2021"; else echo "src does NOT match 2021"; fi
if [ "$dst_ed" = 'edition = "2024"' ]; then echo "dst matches 2024"; else echo "dst does NOT match 2024"; fi
echo ""

if [ "$src_ed" = 'edition = "2021"' ] && [ "$dst_ed" = 'edition = "2024"' ]; then
  echo "CONDITION MET - would copy"
else
  echo "CONDITION NOT MET"
fi
