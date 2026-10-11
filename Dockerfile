FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-alpine AS builder
WORKDIR /app
# Public Plausible tracker settings (lib/cms/plausible.ts). Static pages are
# prerendered here, so the tracker needs them at build time as well as at
# runtime (compose.runtime.yml). Pass empty values to build without it.
ARG PLAUSIBLE_SCRIPT_URL=https://gildra.net/stats/js/script.js
ARG PLAUSIBLE_API_URL=/stats/api/event
ARG PLAUSIBLE_SITE_DOMAIN=gildra.net
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAUSIBLE_SCRIPT_URL=$PLAUSIBLE_SCRIPT_URL PLAUSIBLE_API_URL=$PLAUSIBLE_API_URL PLAUSIBLE_SITE_DOMAIN=$PLAUSIBLE_SITE_DOMAIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run generate:api && npm run build

FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
