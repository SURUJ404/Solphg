# Solphg compiler API image.
#
# Rebased on the hardened builder image (Rust 1.86 / Agave 2.2.7 / Anchor
# 0.31.1). The toolchain image is published to GHCR by CI on main:
#   ghcr.io/<owner>/solphg-builder:latest
#
# For local builds: `docker build -t solphg-builder:latest -f services/builder.Dockerfile services`
# then build this file from the services/ directory.

ARG BUILDER_IMAGE=solphg-builder:latest
FROM ${BUILDER_IMAGE}

USER root
WORKDIR /app

COPY compiler/package.json compiler/package-lock.json ./
RUN npm ci

COPY compiler/tsconfig.json ./
COPY compiler/src ./src
RUN npx tsc \
    && npm prune --omit=dev \
    && chown -R solbuilder:solbuilder /app /var/lib/solphg /tmp/solphg-work

USER solbuilder

ENV NODE_ENV=production \
    PORT=8080 \
    BUILD_CACHE_DIR=/var/lib/solphg/cache \
    BUILD_WORK_DIR=/tmp/solphg-work \
    BUILD_TIMEOUT_MS=180000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
