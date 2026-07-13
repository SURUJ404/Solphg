FROM rust:1.75-slim-bookworm

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
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# --- Solana CLI ---
ENV SOLANA_VERSION=1.18.18
RUN curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install --retry 5 -o /tmp/solana-install.sh && \
    sh /tmp/solana-install.sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# --- Anchor CLI (via avm) ---
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 avm --locked --force
ENV PATH="/root/.avm/bin:${PATH}"
RUN avm install 0.30.1 && avm use 0.30.1

# --- Pre-generate a Cargo.lock for a minimal Anchor project ---
# This lock file pins transitive deps to versions compatible with
# Rust 1.75. The build service copies it to each build workspace so
# cargo metadata doesn't fetch newer crates (e.g. cpufeatures 0.3.0
# which requires edition2024).
RUN ANCHOR_LOCK_DIR=/tmp/anchor-lock-gen && \
    mkdir -p $ANCHOR_LOCK_DIR/programs/test && \
    mkdir -p $ANCHOR_LOCK_DIR/programs/test/src && \
    echo '[toolchain]\nanchor_version = "0.30.1"\n[programs.localnet]\ntest = "11111111111111111111111111111111"\n[provider]\ncluster = "localnet"\nwallet = "/root/.config/solana/id.json"' > $ANCHOR_LOCK_DIR/Anchor.toml && \
    echo '[workspace]\nmembers = ["programs/*"]\nresolver = "2"\n[profile.release]\noverflow-checks = true' > $ANCHOR_LOCK_DIR/Cargo.toml && \
    echo '[package]\nname = "test"\nversion = "0.1.0"\nedition = "2021"\n[lib]\ncrate-type = ["cdylib", "lib"]\n[dependencies]\nanchor-lang = "0.30.1"' > $ANCHOR_LOCK_DIR/programs/test/Cargo.toml && \
    echo 'use anchor_lang::prelude::*; declare_id!("11111111111111111111111111111111"); #[program] pub mod test { pub fn initialize(_ctx: Context<Initialize>) -> Result<()> { Ok(()) } } #[derive(Accounts)] pub struct Initialize {}' > $ANCHOR_LOCK_DIR/programs/test/src/lib.rs && \
    cd $ANCHOR_LOCK_DIR && \
    cargo generate-lockfile 2>&1 && \
    cp Cargo.lock /opt/anchor-lockfile && \
    rm -rf $ANCHOR_LOCK_DIR

# --- Patch cpufeatures 0.3.0 for Rust 1.75 compatibility ---
# cpufeatures 0.3.0 uses edition = "2024" which Rust 1.75 can't parse.
# We manually download the crate, patch its Cargo.toml, and place it
# in cargo's registry cache so that cargo metadata uses the patched version.
RUN CRATE="cpufeatures" VER="0.3.0" && \
    HASH="6f17d35b5b5f5b5f" && \
    CACHE_DIR="/usr/local/cargo/registry/cache/index.crates.io-${HASH}" && \
    SRC_DIR="/usr/local/cargo/registry/src/index.crates.io-${HASH}" && \
    mkdir -p "$CACHE_DIR" "$SRC_DIR" && \
    curl -sSfL "https://static.crates.io/crates/${CRATE}/${CRATE}-${VER}.crate" -o "/tmp/${CRATE}-${VER}.crate" && \
    mkdir -p "/tmp/${CRATE}-${VER}" && \
    tar -xzf "/tmp/${CRATE}-${VER}.crate" -C "/tmp/${CRATE}-${VER}" && \
    sed -i 's/edition = "2024"/edition = "2021"/' "/tmp/${CRATE}-${VER}/${CRATE}-${VER}/Cargo.toml" && \
    cp "/tmp/${CRATE}-${VER}.crate" "${CACHE_DIR}/" && \
    mv "/tmp/${CRATE}-${VER}/${CRATE}-${VER}" "${SRC_DIR}/" && \
    rm -rf "/tmp/${CRATE}-${VER}" "/tmp/${CRATE}-${VER}.crate"

# --- Generate a default local keypair so anchor/solana commands don't fail ---
RUN solana-keygen new --no-bip39-passphrase -o /root/.config/solana/id.json

WORKDIR /app

# --- Install compiler API server deps first (better layer caching) ---
COPY compiler/package.json ./compiler/
RUN cd compiler && npm install

# --- Copy source ---
COPY compiler ./compiler

WORKDIR /app/compiler
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/index.js"]
