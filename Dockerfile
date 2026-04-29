# ---- Stage 1: Builder ----
FROM oven/bun:alpine AS builder
WORKDIR /app

# 1. Copy root config AND the lockfile (Crucial for consistent builds)
COPY package.json bun.lock ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

# 2. Install ALL dependencies
# Running this at the root ensures workspaces are linked correctly
RUN bun install

# 3. Copy source code
COPY packages ./packages

# 4. Build Frontend (Vite)
# Run from ROOT using the filter; this ensures Bun finds the vite binary in the root node_modules
RUN bun run --filter webui build

# 5. Build Backend
WORKDIR /app/packages/backend
RUN bun build src/index.ts --outdir dist --target=bun --bundle

# ---- Stage 2: Runtime ----
FROM oven/bun:distroless
WORKDIR /app

# Only copy the essential artifacts
COPY --from=builder /app/packages/backend/dist/index.js ./packages/backend/src/index.js
COPY --from=builder /app/packages/public ./packages/public
COPY packages/backend/config.toml ./packages/backend/config.toml 

EXPOSE 3000

# Use 'bun' directly for the entrypoint in distroless
ENTRYPOINT ["bun", "packages/backend/src/index.js"]