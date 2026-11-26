# Railway deployment image.
#
# Railway does not have a Docker socket, so the API cannot spawn sibling build
# containers there. Build isolation therefore relies on the hardened image
# below plus Railway's service limits (see docs/SECURITY.md).
#
# CI publishes the toolchain image. Override BUILDER_IMAGE in Railway if you
# publish under a different owner/tag.
ARG BUILDER_IMAGE=ghcr.io/suruj404/solphg-builder:latest
FROM ${BUILDER_IMAGE}

USER root
WORKDIR /app

COPY compiler/package.json compiler/package-lock.json ./
RUN npm ci

COPY compiler/tsconfig.json ./
COPY compiler/src ./src
RUN npx tsc \
    && npm prune --omit=dev \
    && chown -R solbuilder:solbuilder /app /var/lib/solphg

USER solbuilder

ENV NODE_ENV=production \
    PORT=8080 \
    BUILD_CACHE_DIR=/var/lib/solphg/cache \
    BUILD_WORK_DIR=/workspaces/build \
    BUILD_TIMEOUT_MS=180000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
