FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm workspaces (apps/*, packages/*): each workspace manifest must exist for npm ci.
COPY apps/web/package.json apps/web/package.json
COPY packages/game-data/package.json packages/game-data/package.json
COPY packages/atlas-ui/package.json packages/atlas-ui/package.json
RUN npm ci

FROM node:22.23.2-alpine AS builder
WORKDIR /app
# Public Plausible tracker settings (lib/cms/plausible.ts). Static pages are
# prerendered here, so the tracker needs them at build time as well as at
# runtime (compose.runtime.yml). Pass empty values to build without it.
ARG PLAUSIBLE_SCRIPT_URL=https://gildra.net/stats/js/script.js
ARG PLAUSIBLE_API_URL=/stats/api/event
ARG PLAUSIBLE_SITE_DOMAIN=gildra.net
# Error reports (GlitchTip project gildra-web, roadmap 96). The DSN key is public
# by design: every browser receives it, and reports reach the internal GlitchTip
# only through /monitoring (app/monitoring/route.ts), which accepts this DSN
# alone. Baked into the client bundle; pass an empty value to build without it.
ARG NEXT_PUBLIC_SENTRY_DSN=http://dc8456a7f08348689f504db20d5fc692@glitchtip:8000/1
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAUSIBLE_SCRIPT_URL=$PLAUSIBLE_SCRIPT_URL PLAUSIBLE_API_URL=$PLAUSIBLE_API_URL PLAUSIBLE_SITE_DOMAIN=$PLAUSIBLE_SITE_DOMAIN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The site is the workspace apps/web (roadmap item 81); standalone tracing
# starts at the repository root, so the server lands in standalone/apps/web.
# Turbopack links a few externals from .next/node_modules to the root
# node_modules; the runner flattens apps/web onto /app, so point them there.
RUN npm run generate:api && npm run build \
 && externals=apps/web/.next/standalone/apps/web/.next/node_modules \
 && if [ -d "$externals" ]; then for link in "$externals"/*; do \
      target=$(readlink "$link"); ln -sfn "../../node_modules/${target##*/node_modules/}" "$link"; done; fi

FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Same runtime layout as before the move: /app/server.js, /app/.next (the
# tmpfs mounts in compose.runtime.yml), /app/public, /app/node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
