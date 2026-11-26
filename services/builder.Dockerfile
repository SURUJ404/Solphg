# syntax=docker/dockerfile:1.7
#
# Solphg builder toolchain.
#
# This image contains Rust 1.86, Agave 2.2.7 (cargo-build-sbf + SBF
# platform-tools), Anchor CLI 0.31.1, and a fully warmed Cargo registry for
# both anchor-lang and anchor-spl. It deliberately contains no application
# code; services/Dockerfile layers the API on top of it.
#
# Platform-tools are downloaded by Agave into $HOME/.cache/solana at image
# build time. We copy that tree to /usr/local/share/solana-cache so the
# non-root build user (and every per-job HOME) can reach it via symlink.

FROM node:22-bookworm-slim AS toolchain

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    SOLANA_HOME=/usr/local/solana \
    PATH="/usr/local/cargo/bin:/usr/local/solana/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config libssl-dev libudev-dev libgmp-dev \
      curl ca-certificates git clang cmake llvm bzip2 \
    && rm -rf /var/lib/apt/lists/*

# Rust 1.86 has native edition-2024 support, which removes the old
# patch-the-registry scripts entirely.
ARG RUST_VERSION=1.86.0
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain "${RUST_VERSION}" --profile minimal \
    && rustup component add rustfmt clippy \
    && rustc --version

# Agave CLI suite. Provides solana, solana-keygen and cargo-build-sbf.
ARG AGAVE_VERSION=v2.2.7
# The bootstrap script forwards every argument to agave-install-init, whose
# CLI shape is `agave-install-init [OPTIONS] <release>`. Passing only `-d`
# drops the required positional release and makes the installer fail with
# "Please specify the release to install", so pass the tag explicitly.
RUN curl -sSfL "https://release.anza.xyz/${AGAVE_VERSION}/install" -o /tmp/agave-install.sh \
    && sh /tmp/agave-install.sh "${AGAVE_VERSION}" -d "${SOLANA_HOME}" \
    && ln -sf "${SOLANA_HOME}/active_release/bin/"* /usr/local/bin/ \
    && solana --version \
    && cargo-build-sbf --version

# Anchor CLI 0.31.1 (no avm indirection).
ARG ANCHOR_VERSION=0.31.1
RUN cargo install --git https://github.com/coral-xyz/anchor \
      --tag "v${ANCHOR_VERSION}" anchor-cli --locked --force \
    && anchor --version

# A provider wallet file is required by Anchor's config loader. It is a
# throwaway key with no funds.
RUN solana-keygen new --no-bip39-passphrase --silent --force \
      --outfile /root/.config/solana/id.json

# Warm the Cargo registry and download SBF platform-tools with a project
# that depends on BOTH anchor-lang and anchor-spl. The SPL template would
# otherwise fail offline.
#
# The canonical lockfile pins transitive crates to their last edition-2021 /
# Rust-1.79-compatible releases. SBF platform-tools ships Cargo 1.79, which
# cannot parse edition-2024 manifests, so resolution must be pinned rather
# than left to the host Cargo at image build time.
WORKDIR /opt/warmup
COPY canonical-anchor.lock /opt/warmup/Cargo.lock
RUN mkdir -p programs/warmup/src \
    && printf '%s\n' \
      '[features]' \
      'resolution = true' \
      'skip-lint = false' \
      '' \
      '[programs.localnet]' \
      'warmup = "11111111111111111111111111111111"' \
      '' \
      '[provider]' \
      'cluster = "Localnet"' \
      'wallet = "~/.config/solana/id.json"' \
      '' \
      '[toolchain]' \
      'anchor_version = "0.31.1"' \
      > Anchor.toml \
    && printf '%s\n' \
      '[workspace]' \
      'members = ["programs/*"]' \
      'resolver = "2"' \
      '' \
      '[profile.release]' \
      'overflow-checks = true' \
      > Cargo.toml \
    && printf '%s\n' \
      '[package]' \
      'name = "warmup"' \
      'version = "0.1.0"' \
      'edition = "2021"' \
      '' \
      '[lib]' \
      'crate-type = ["cdylib", "lib"]' \
      'name = "warmup"' \
      'path = "src/lib.rs"' \
      '' \
      '[features]' \
      'no-entrypoint = []' \
      'cpi = ["no-entrypoint"]' \
      'default = []' \
      'idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]' \
      '' \
      '[dependencies]' \
      'anchor-lang = "0.31.1"' \
      'anchor-spl = "0.31.1"' \
      > programs/warmup/Cargo.toml \
    && printf '%s\n' \
      'use anchor_lang::prelude::*;' \
      'use anchor_spl::token::{Token, TokenAccount, Transfer};' \
      '' \
      'declare_id!("11111111111111111111111111111111");' \
      '' \
      '#[program]' \
      'pub mod warmup {' \
      '    use super::*;' \
      '    pub fn noop(_ctx: Context<Noop>) -> Result<()> {' \
      '        let _ = (std::mem::size_of::<Transfer>(), std::mem::size_of::<TokenAccount>());' \
      '        Ok(())' \
      '    }' \
      '}' \
      '' \
      '#[derive(Accounts)]' \
      'pub struct Noop<'"'"'info> {' \
      "    pub token_program: Program<'info, Token>," \
      '}' \
      > programs/warmup/src/lib.rs \
    && anchor build \
    && cp Cargo.lock /usr/local/cargo/canonical-anchor.lock \
    && mkdir -p /usr/local/share/solana-cache \
    && cp -a /root/.cache/solana /usr/local/share/solana-cache/ \
    && rm -rf /opt/warmup /root/.cache/solana

# Non-root runtime identity for compiling untrusted code.
RUN useradd --create-home --uid 10001 --shell /bin/bash solbuilder \
    && mkdir -p /workspaces/build /app /var/lib/solphg/cache \
    && chown -R solbuilder:solbuilder /workspaces /app /var/lib/solphg \
    && find /usr/local/solana -type d -path '*/platform-tools-sdk/sbf/dependencies' \
        -exec chown -R solbuilder:solbuilder {} + \
    && chown -R solbuilder:solbuilder /usr/local/rustup \
    && chmod -R a+rX /usr/local/cargo /usr/local/rustup /usr/local/solana /usr/local/share/solana-cache

# Build work must live on an executable tmpfs, never on the noexec /tmp mount:
# cargo build-sbf writes and executes generated scripts in this directory.
ENV CARGO_NET_OFFLINE=true \
    SOLANA_SHARED_HOME=/usr/local/share/solana-cache \
    BUILD_CACHE_DIR=/var/lib/solphg/cache \
    BUILD_WORK_DIR=/workspaces/build

USER solbuilder
WORKDIR /workspaces

# Smoke-testable default.
CMD ["anchor", "--version"]
