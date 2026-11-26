# Canonical Anchor Cargo lock

`canonical-anchor.lock` is copied into the image as `/opt/warmup/Cargo.lock`
by `builder.Dockerfile`, used to warm the offline registry, and then installed
as `/usr/local/cargo/canonical-anchor.lock`. The compiler copies that file into
every generated Anchor project before running `anchor build`.

SBF platform-tools (Agave 2.2.7) ship Cargo 1.79. Modern Cargo resolves
transitive crates that use the edition-2024 manifest format, which Cargo 1.79
cannot parse, so this lock must stay pinned to edition-2021 crates whose
`rust-version` is at most 1.79 for every crate on the SBF target graph.

The pins used to generate it were:

- `ahash = "=0.8.12"`
- `blake3 = "=1.5.5"`
- `getrandom = "=0.3.4"`
- `hashbrown = "=0.16.1"`
- `indexmap = "=2.11.4"`
- `proc-macro-crate = "=3.4.0"`
- `toml_parser = "=1.0.9+spec-1.1.0"`
- `unicode-segmentation = "=1.12.0"`
- `zeroize = "=1.8.2"`
- `zeroize_derive = "=1.4.3"`

The remaining wasi/wasm target-only entries may still use edition 2024; Cargo
1.79 does not parse manifests for targets it is not building, and they are
never part of the SBF build.

To regenerate, create a temporary Anchor 0.31 workspace with those pins added
to the program's `[dependencies]`, run `cargo generate-lockfile`, verify no
target-relevant crate has `edition = "2024"` or `rust-version > 1.79`, then
copy the resulting `Cargo.lock` here. `cargo audit --file canonical-anchor.lock`
must exit successfully.
