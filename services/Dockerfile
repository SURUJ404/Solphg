# Thin API image for Solphg build service.
# Spawns sandboxed builder containers via host Docker socket.
# Runs under sysbox-runc for enhanced isolation.

FROM node:20-slim AS builder

WORKDIR /app
COPY compiler/package*.json ./
RUN npm ci

COPY compiler/tsconfig.json ./
COPY compiler/src/ ./src/
RUN npx tsc

# --- Production stage ---
FROM node:20-slim

# Install Docker CLI (client only — connects to host daemon via mounted socket)
RUN apt-get update && apt-get install -y \
    docker.io \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "dist/index.js"]
