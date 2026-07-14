FROM rust:1.75-slim-bookworm AS builder-toolchain

# --- System deps ---
RUN printf 'Types: deb\nURIs: http://deb.debian.org/debian\nSuites: bookworm\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n' > /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Solana CLI ---
ENV SOLANA_VERSION=1.18.18
RUN curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install --retry 5 -o /tmp/solana-install.sh && \
    sh /tmp/solana-install.sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# --- Anchor CLI (via avm) — use Rust 1.75 (default) since 0.30.1 is pinned to it ---
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 avm --locked --force
ENV PATH="/root/.avm/bin:${PATH}"
RUN avm install 0.30.1 && avm use 0.30.1

# --- Rust 1.85 for metadata resolution (handles edition2024) — install after Anchor ---
RUN rustup install 1.85.1 && rustup default 1.85.1

# --- Generate local keypair ---
RUN solana-keygen new --no-bip39-passphrase -o /root/.config/solana/id.json

# --- Pre-download platform-tools (needed by cargo-build-sbf, avoid runtime timeout) ---
# Also link the bundled Rust toolchain as "solana" (used by cargo-build-sbf)
ENV PLATFORM_TOOLS_VERSION=v1.41
RUN mkdir -p /root/.cache/solana/${PLATFORM_TOOLS_VERSION}/ && \
    curl -sSfL --retry 5 -o /tmp/platform-tools.tar.bz2 \
      https://github.com/anza-xyz/platform-tools/releases/download/${PLATFORM_TOOLS_VERSION}/platform-tools-linux-x86_64.tar.bz2 && \
    mkdir -p /root/.cache/solana/${PLATFORM_TOOLS_VERSION}/platform-tools && \
    tar -xjf /tmp/platform-tools.tar.bz2 -C /root/.cache/solana/${PLATFORM_TOOLS_VERSION}/platform-tools/ && \
    rm -f /tmp/platform-tools.tar.bz2 && \
    /root/.cache/solana/${PLATFORM_TOOLS_VERSION}/platform-tools/rust/bin/rustc --version && \
    PLATFORM_TOOLS_DIR="/root/.local/share/solana/install/active_release/bin/sdk/sbf/dependencies" && \
    mkdir -p "$PLATFORM_TOOLS_DIR" && \
    ln -sf /root/.cache/solana/${PLATFORM_TOOLS_VERSION}/platform-tools "$PLATFORM_TOOLS_DIR/platform-tools" && \
    touch "$PLATFORM_TOOLS_DIR/platform-tools-${PLATFORM_TOOLS_VERSION}.md"

# --- Create minimal project for dep fetch and lockfile generation ---
RUN mkdir -p /tmp/fetch-deps/programs/test/src && \
    printf '[toolchain]\nanchor_version = "0.30.1"\n[programs.localnet]\ntest = "11111111111111111111111111111111"\n[provider]\ncluster = "localnet"\nwallet = "/root/.config/solana/id.json"\n' > /tmp/fetch-deps/Anchor.toml && \
    printf '[workspace]\nmembers = ["programs/*"]\nresolver = "3"\n[profile.release]\noverflow-checks = true\n' > /tmp/fetch-deps/Cargo.toml && \
    printf '[package]\nname = "test"\nversion = "0.1.0"\nedition = "2021"\nrust-version = "1.75"\n[lib]\ncrate-type = ["cdylib", "lib"]\n[dependencies]\nanchor-lang = "0.30.1"\n[features]\nidl-build = ["anchor-lang/idl-build"]\n' > /tmp/fetch-deps/programs/test/Cargo.toml && \
    printf 'use anchor_lang::prelude::*;\ndeclare_id!("11111111111111111111111111111111");\n#[program]\npub mod test {\n    use super::*;\n    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> { Ok(()) }\n}\n#[derive(Accounts)]\npub struct Initialize {}\n' > /tmp/fetch-deps/programs/test/src/lib.rs

# Step 1: Fetch all deps with Rust 1.85 (populates cargo 1.85 cache)
RUN cd /tmp/fetch-deps && cargo fetch 2>&1

# Step 2: Generate lockfile with Rust 1.85, save as v3 format
RUN cd /tmp/fetch-deps && \
    cargo generate-lockfile 2>&1 && \
    sed -i 's/^version = 4$/version = 3/' Cargo.lock && \
    cp Cargo.lock /opt/anchor-lockfile

# Step 3: Sync cargo 1.75 index (needed by cargo metadata --offline during build).
# Use a temp Cargo.toml with resolver="2" since 1.75 doesn't understand resolver="3".
# Restore MSRV-safe lockfile afterwards so step 4 fetches the right versions.
RUN rustup default 1.75.0 && \
    cd /tmp/fetch-deps && \
    sed -i 's/resolver = "3"/resolver = "2"/' Cargo.toml && \
    cargo generate-lockfile 2>&1 && \
    rustup default 1.85.1 && \
    sed -i 's/resolver = "2"/resolver = "3"/' Cargo.toml && \
    cp /opt/anchor-lockfile /tmp/fetch-deps/Cargo.lock

# Step 4: Fetch all locked deps (1.85 can handle edition2024 manifests)
RUN cd /tmp/fetch-deps && \
    cargo fetch --locked 2>&1

# Step 4: Patch all .crate files (both caches globbed).
# Fixes: edition2024 -> 2021 (cargo 1.75 can't parse edition2024)
# Removes: rust-version field (cargo 1.75 enforces MSRV checks)
RUN for crate in /usr/local/cargo/registry/cache/index.crates.io-*/*.crate; do \
      [ -f "$crate" ] || continue; \
      toplevel=$(tar -tzf "$crate" 2>/dev/null | head -1 | cut -d/ -f1); \
      [ -n "$toplevel" ] || continue; \
      manifest=$(tar -xzf "$crate" -O "$toplevel/Cargo.toml" 2>/dev/null); \
      has_edit=$(echo "$manifest" | grep "^edition = \"2024\"" | head -1); \
      has_msrv=$(echo "$manifest" | grep "^rust-version" | head -1); \
      if [ -n "$has_edit" ] || [ -n "$has_msrv" ]; then \
        tmpdir=$(mktemp -d); \
        tar -xzf "$crate" -C "$tmpdir"; \
        find "$tmpdir" -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
        find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
        find "$tmpdir" -name "Cargo.toml" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null; \
        find "$tmpdir" -name "Cargo.toml.orig" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null; \
        (cd "$tmpdir" && tar -czf "$crate" "$toplevel"); \
        rm -rf "$tmpdir"; \
      fi; \
    done

# Step 5: Patch extracted src dirs in both caches (edition2024 + rust-version)
RUN find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml.orig" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null

# Step 5b: Patch crate source files for platform-tools Rust 1.75.0-dev compatibility.
# We use CARGO_TARGET_SBF_SOLANA_SOLANA_RUSTFLAGS with -Zcrate-attr to pass nightly features globally.
# But some crates need source patches that -Zcrate-attr cannot fix:
#   - hybrid-array 0.4.13: refutable let pattern in from_fn.rs (edition 2021)
#   - cmov 0.5.4: missing core::mem imports (size_of, align_of, size_of_val)
RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/hybrid-array-*; do \
      [ -d "$dir" ] || continue; \
      sed -i 's/let Ok(ret) = Self::try_from_fn::<Infallible>(|n| Ok(f(n)));/Self::try_from_fn::<Infallible>(|n| Ok(f(n))).unwrap()/' "$dir/src/from_fn.rs"; \
      sed -i '/^        ret$/d' "$dir/src/from_fn.rs"; \
    done
RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/cmov-*; do \
      [ -d "$dir" ] || continue; \
      sed -i '1a\use core::mem::{size_of, align_of, size_of_val};' "$dir/src/slice.rs"; \
    done

# Step 5c: Patch anchor-syn's IDL generation to not use proc_macro2::Span::source_file().
# This method is gated behind feature "source-file" in proc-macro2 on stable Rust,
# and anchor 0.30.1's IDL compilation for host fails because of it.
# We use a fallback path string so the IDL build compiles on stable Rust.
RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/anchor-syn-*; do \
      [ -d "$dir" ] || continue; \
      sed -i 's|let source_path = proc_macro2::Span::call_site().source_file().path();|let source_path = std::path::PathBuf::from("program/src/lib.rs");|' "$dir/src/idl/defined.rs"; \
    done

# Step 6: Copy entire 1.85 cache + src + index.cache to 1.75 caches
# (so cargo 1.75 finds all packages offline with patched edition2024)
RUN SRC_HASH_85="1949cf8c6b5b557f"; DST_HASH_75="6f17d22bba15001f"; \
    cp -r /usr/local/cargo/registry/cache/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/cache/index.crates.io-$DST_HASH_75/ && \
    cp -r /usr/local/cargo/registry/src/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/src/index.crates.io-$DST_HASH_75/ && \
    cp -r /usr/local/cargo/registry/index/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/index/index.crates.io-$DST_HASH_75/

# Cleanup
RUN rm -rf /tmp/fetch-deps

# Inject nightly features required by platform-tools Rust 1.75.0-dev via RUSTFLAGS.
# These are injected globally for the SBF target so all dependencies benefit.
# Without this, many crates fail because platform-tools Rust doesn't honor RUSTC_BOOTSTRAP=1.
ENV CARGO_TARGET_SBF_SOLANA_SOLANA_RUSTFLAGS="-Zcrate-attr=feature(error_in_core,const_mut_refs,ptr_from_ref,diagnostic_namespace,const_slice_from_raw_parts_mut,const_option,const_array_from_ref,raw_ref_op,inline_const,slice_split_at_unchecked,const_refs_to_cell)"

# Default command: expect to be run with a workspace volume mounted
WORKDIR /workspace
ENTRYPOINT ["/bin/sh", "-c"]
