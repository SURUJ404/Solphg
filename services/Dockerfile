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

# --- Node.js 20 ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && npm --version

# --- Solana CLI ---
ENV SOLANA_VERSION=1.18.18
RUN curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install --retry 5 -o /tmp/solana-install.sh && \
    sh /tmp/solana-install.sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# --- Anchor CLI (via avm) ---
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 avm --locked --force
ENV PATH="/root/.avm/bin:${PATH}"
RUN avm install 0.30.1 && avm use 0.30.1

# --- Rust 1.85 for metadata resolution ---
RUN rustup install 1.85.1 && rustup default 1.85.1

# --- Generate local keypair ---
RUN solana-keygen new --no-bip39-passphrase -o /root/.config/solana/id.json

# --- Pre-download platform-tools ---
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

# --- Create fetch-deps project ---
RUN mkdir -p /tmp/fetch-deps/programs/test/src && \
    printf '[toolchain]\nanchor_version = "0.30.1"\n[programs.localnet]\ntest = "11111111111111111111111111111111"\n[provider]\ncluster = "localnet"\nwallet = "/root/.config/solana/id.json"\n' > /tmp/fetch-deps/Anchor.toml && \
    printf '[workspace]\nmembers = ["programs/*"]\nresolver = "3"\n[profile.release]\noverflow-checks = true\n' > /tmp/fetch-deps/Cargo.toml && \
    printf '[package]\nname = "test"\nversion = "0.1.0"\nedition = "2021"\nrust-version = "1.75"\n[lib]\ncrate-type = ["cdylib", "lib"]\n[dependencies]\nanchor-lang = "0.30.1"\n[features]\nidl-build = ["anchor-lang/idl-build"]\n' > /tmp/fetch-deps/programs/test/Cargo.toml && \
    printf 'use anchor_lang::prelude::*;\ndeclare_id!("11111111111111111111111111111111");\n#[program]\npub mod test {\n    use super::*;\n    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> { Ok(()) }\n}\n#[derive(Accounts)]\npub struct Initialize {}\n' > /tmp/fetch-deps/programs/test/src/lib.rs

RUN cd /tmp/fetch-deps && cargo fetch 2>&1

RUN cd /tmp/fetch-deps && \
    cargo generate-lockfile 2>&1 && \
    sed -i 's/^version = 4$/version = 3/' Cargo.lock && \
    cp Cargo.lock /opt/anchor-lockfile

RUN rustup default 1.75.0 && \
    cd /tmp/fetch-deps && \
    sed -i 's/resolver = "3"/resolver = "2"/' Cargo.toml && \
    cargo generate-lockfile 2>&1 && \
    rustup default 1.85.1 && \
    sed -i 's/resolver = "2"/resolver = "3"/' Cargo.toml && \
    cp /opt/anchor-lockfile /tmp/fetch-deps/Cargo.lock

RUN cd /tmp/fetch-deps && cargo fetch --locked 2>&1

# --- Patch crates for edition2024 + MSRV ---
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

RUN find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml.orig" -exec sed -i 's/edition = "2024"/edition = "2021"/' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null; \
    find /usr/local/cargo/registry/src/index.crates.io-*/ -name "Cargo.toml.orig" -exec sed -i '/^rust-version/d' {} \; 2>/dev/null

RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/hybrid-array-*; do \
      [ -d "$dir" ] || continue; \
      sed -i 's/let Ok(ret) = Self::try_from_fn::<Infallible>(|n| Ok(f(n)));/Self::try_from_fn::<Infallible>(|n| Ok(f(n))).unwrap()/' "$dir/src/from_fn.rs"; \
      sed -i '/^        ret$/d' "$dir/src/from_fn.rs"; \
    done
RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/cmov-*; do \
      [ -d "$dir" ] || continue; \
      sed -i '1a\use core::mem::{size_of, align_of, size_of_val};' "$dir/src/slice.rs"; \
    done

RUN for dir in /usr/local/cargo/registry/src/index.crates.io-*/anchor-syn-*; do \
      [ -d "$dir" ] || continue; \
      sed -i 's|let source_path = proc_macro2::Span::call_site().source_file().path();|let source_path = std::path::PathBuf::from("program/src/lib.rs");|' "$dir/src/idl/defined.rs"; \
    done

RUN SRC_HASH_85="1949cf8c6b5b557f"; DST_HASH_75="6f17d22bba15001f"; \
    cp -r /usr/local/cargo/registry/cache/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/cache/index.crates.io-$DST_HASH_75/ && \
    cp -r /usr/local/cargo/registry/src/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/src/index.crates.io-$DST_HASH_75/ && \
    cp -r /usr/local/cargo/registry/index/index.crates.io-$SRC_HASH_85/. /usr/local/cargo/registry/index/index.crates.io-$DST_HASH_75/

RUN rm -rf /tmp/fetch-deps

ENV CARGO_TARGET_SBF_SOLANA_SOLANA_RUSTFLAGS="-Zcrate-attr=feature(error_in_core,const_mut_refs,ptr_from_ref,diagnostic_namespace,const_slice_from_raw_parts_mut,const_option,const_array_from_ref,raw_ref_op,inline_const,slice_split_at_unchecked,const_refs_to_cell)"

# --- Build API code ---
FROM node:20-slim AS api-builder

WORKDIR /app
COPY compiler/package*.json ./
RUN npm ci

COPY compiler/tsconfig.json ./
COPY compiler/src/ ./src/
RUN npx tsc

# --- Production stage ---
FROM builder-toolchain

WORKDIR /app

COPY --from=api-builder /app/dist ./dist
COPY --from=api-builder /app/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "dist/index.js"]
