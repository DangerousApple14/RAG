# ─────────────────────────────────────────────────────────────────
# Multi-stage build for Render (amd64) / Docker Hub / any host.
#
# WHY debian (bookworm-slim) and NOT alpine:
#   onnxruntime-node (PaddleOCR) ships glibc-only prebuilt binaries and
#   needs libgomp1 — both break on Alpine/musl.
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: build (needs devDependencies: typescript, tailwind) ──
# pdfjs-dist 6 requires Node 22.13+ (Promise.withResolvers).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# dummy sqlite url just so prisma tooling is happy during build
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate && npm run build

# ── Stage 2: production-only dependencies (for `prisma db push` at
#    boot + native packages that must resolve from /app/node_modules) ──
FROM node:22-bookworm-slim AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# CRITICAL: generate the real Prisma client in this tree too.
# @prisma/client's postinstall skips generate when no schema is present,
# leaving a STUB here — and if the standalone server's runtime resolution
# falls back to /app/node_modules for the engine, every DB query 500s with
# "@prisma/client did not initialize yet". Standalone's traced copy is
# generated in the build stage; this makes the fallback fully functional.
COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 3: runner ───────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# libgomp1: OpenMP runtime required by onnxruntime (PaddleOCR).
# ca-certificates: HTTPS to LLM providers.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    DATABASE_URL=file:/app/data/custom.db

# standalone server (already contains traced deps + static assets)
COPY --from=build /app/.next/standalone ./.next/standalone
COPY --from=build /app/.next/static ./.next/standalone/.next/static
COPY --from=build /app/public ./.next/standalone/public

# full prod node_modules + prisma schema so the boot step can run
# `prisma db push` and native deps (onnxruntime, pdfjs fonts) resolve
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# boot: ensure data dir exists → create/migrate SQLite schema → serve.
# `exec` replaces the shell so Node receives SIGTERM (clean Render restarts).
CMD ["sh", "-c", "mkdir -p \"$DATA_DIR\" && npx prisma db push --accept-data-loss --skip-generate && exec node .next/standalone/server.js"]
