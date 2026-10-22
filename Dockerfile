# Layer order follows how often things change: dependencies (package-lock.json),
# then the source. BuildKit cache mounts keep the npm download cache, the
# TypeScript build info and Next.js's .next/cache (Turbopack's persistent build
# cache) between builds, so a rebuild redoes only what the commit changed. The
# type check runs as its own stage, in parallel with `next build`, and still
# gates the image (the runner copies its marker).
FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm workspaces (apps/*, packages/*): each workspace manifest must exist for npm ci.
COPY apps/web/package.json apps/web/package.json
COPY packages/game-data/package.json packages/game-data/package.json
COPY packages/atlas-ui/package.json packages/atlas-ui/package.json
# Root postinstall: local fix of the Next.js image optimizer (see the script).
COPY scripts/patch-next.mjs scripts/patch-next.mjs
RUN --mount=type=cache,id=gildra-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund

FROM deps AS source
COPY . .
RUN npm run generate:api

FROM source AS typecheck
# `next typegen` writes the route types that `next build` would generate first.
RUN --mount=type=cache,id=gildra-web-tsc,target=/tsc,sharing=locked \
    cd apps/web && npx next typegen \
 && npx tsc --noEmit --incremental --tsBuildInfoFile /tsc/web.tsbuildinfo \
 && touch /typecheck.ok

FROM source AS builder
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
# Prerender workers (next.config.ts); each peaks around 0.4 GB.
ARG GILDRA_BUILD_CPUS=4
# The typecheck stage checks types; next build skips its own pass (next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1 GILDRA_TYPECHECK_STAGE=1 GILDRA_BUILD_CPUS=$GILDRA_BUILD_CPUS \
    PLAUSIBLE_SCRIPT_URL=$PLAUSIBLE_SCRIPT_URL PLAUSIBLE_API_URL=$PLAUSIBLE_API_URL PLAUSIBLE_SITE_DOMAIN=$PLAUSIBLE_SITE_DOMAIN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
# The site is the workspace apps/web (roadmap item 81); standalone tracing
# starts at the repository root, so the server lands in standalone/apps/web.
# Turbopack links a few externals from .next/node_modules to the root
# node_modules; the runner flattens apps/web onto /app, so point them there.
RUN --mount=type=cache,id=gildra-web-next,target=/app/apps/web/.next/cache,sharing=locked \
    npm run build \
 && externals=apps/web/.next/standalone/apps/web/.next/node_modules \
 && if [ -d "$externals" ]; then for link in "$externals"/*; do \
      target=$(readlink "$link"); ln -sfn "../../node_modules/${target##*/node_modules/}" "$link"; done; fi

FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Same runtime layout as before the move: /app/server.js, /app/.next (the
# tmpfs mounts in compose.runtime.yml), /app/public, /app/node_modules.
# public/ (≈340 MB of art) comes straight from the build context, which the
# build never changes: the layer stays cached and shared between releases
# instead of being compressed and stored again for every image.
COPY --link --chown=1001:1001 apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
# No image without a passing type check.
COPY --from=typecheck /typecheck.ok /typecheck.ok
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
