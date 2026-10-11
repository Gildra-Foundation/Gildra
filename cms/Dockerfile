FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN PAYLOAD_SECRET=build-only-placeholder \
    PAYLOAD_DATABASE_URL=postgres://build:build@localhost/build \
    npm run build

# Dedicated jobs runner (scheduled publishing, signed site cache invalidation).
# Build with `--target jobs`. Needs the full dependency tree to run TypeScript
# through the Payload CLI, so it is a separate image from the standalone server.
FROM node:22.23.2-alpine AS jobs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 CMS_JOBS_AUTORUN=false
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 payload
COPY --from=deps --chown=payload:nodejs /app/node_modules ./node_modules
COPY --chown=payload:nodejs package.json tsconfig.json ./
COPY --chown=payload:nodejs src ./src
USER payload
# Run node directly (PID 1) so SIGTERM reaches the worker for a clean stop.
CMD ["node", "node_modules/payload/bin.js", "run", "src/scripts/jobs-worker.ts"]

# Default target: the CMS server (unchanged behaviour). With NODE_ENV=production
# Payload applies pending `prodMigrations` on start.
FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 payload
COPY --from=builder --chown=payload:nodejs /app/.next/standalone ./
COPY --from=builder --chown=payload:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/media && chown payload:nodejs /app/media
USER payload
EXPOSE 3001
CMD ["node", "server.js"]
