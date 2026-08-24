FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PAYLOAD_SECRET=build-only-secret PAYLOAD_DATABASE_URL=postgres://build:build@localhost/build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

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
