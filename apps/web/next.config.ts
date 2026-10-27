import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const monorepoRoot = path.join(process.cwd(), "../..");

const additionalDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const misplacedWowBossRedirects = [
  ["ravi", "dungeons/altar-of-fangs"],
  ["the-writhing-coil", "dungeons/altar-of-fangs"],
  ["zuljan", "dungeons/altar-of-fangs"],
  ["drakta", "delves/the-ring-of-glory"],
  ["gnok", "delves/the-ring-of-glory"],
  ["gralka-snake-eater", "delves/gnarldor-isle"],
  ["osseous-amalgamation", "delves/gnarldor-isle"],
  ["aztarec", "delves/venomfall-deeps"],
] as const;

const legacyWowSpecRedirects = [
  ["frost-death-knight", "death-knight/frost-death-knight"],
  ["arcane-mage", "mage/arcane-mage"],
  ["augmentation-evoker", "evoker/augmentation-evoker"],
  ["retribution-paladin", "paladin/retribution-paladin"],
  ["outlaw-rogue", "rogue/outlaw-rogue"],
  ["balance-druid", "druid/balance-druid"],
  ["shadow-priest", "priest/shadow-priest"],
  ["marksmanship-hunter", "hunter/marksmanship-hunter"],
  ["elemental-shaman", "shaman/elemental-shaman"],
  ["affliction-warlock", "warlock/affliction-warlock"],
] as const;

const nextConfig: NextConfig = {
  // App Router Strict Mode replays client renders in development. Keep it opt-in
  // for local browsing; production stays strict, and NEXT_REACT_STRICT_MODE=1
  // restores the development audit when needed.
  reactStrictMode: process.env.NODE_ENV !== "development" || process.env.NEXT_REACT_STRICT_MODE === "1",
  // Keep the public character-page preview free of Next's floating dev badge.
  devIndicators: false,
  // Keep recent routes warm while browsing the large app. With a five-page
  // buffer and a one-minute expiry, returning to a page after several route
  // changes forces a full dev recompilation and makes navigation feel stuck.
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000,
    pagesBufferLength: 12,
  },
  output: "standalone",
  // Local profiling only (GILDRA_SOURCEMAPS=1): ship browser source maps to map CPU profiles to source.
  productionBrowserSourceMaps: process.env.GILDRA_SOURCEMAPS === "1",
  // Workspace packages ship TypeScript source (roadmap item 81).
  transpilePackages: ["@gildra/game-data", "@gildra/atlas-ui"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingIncludes: {
    "/talents/[spec]": ["./app/styles/talents/specs/**/*.css"],
    "/ru/talents/[spec]": ["./app/styles/talents/specs/**/*.css"],
  },
  // The link-preview routes read fonts and art from public/ (lib/og/atlasOg.tsx), so
  // tracing would copy public/ into .next/standalone and the image would hold it
  // twice (the Dockerfile copies public/ to /app/public anyway).
  outputFileTracingExcludes: { "*": ["public/**"] },
  // Fetch and ISR entries stay in memory (see the handler); only optimized
  // images use the disk cache, which lives in the container's bounded tmpfs.
  cacheHandler: path.join(process.cwd(), "lib/next/memoryCacheHandler.cjs"),
  images: {
    qualities: [50, 75, 90],
    // Least-recently-used variants are evicted past this size, so the image
    // cache can never fill /app/.next/cache (a 128 MB tmpfs in production).
    maximumDiskCacheSize: 96 * 1024 * 1024,
  },
  experimental: {
    // Group CSS by what each route imports instead of merging every page's
    // styles into shared chunks. A request is priced at 6 KB of CSS (default
    // 20 KB): small route modules (characters, login, book) no longer ride
    // along in the layout chunk of every inner page; −30…100 KB CSS per route
    // for the same 5–9 requests (measured 2026-10-11).
    // Bound image prerendering so builds do not exhaust memory on the shared host.
    // A prerender worker peaks around 0.4 GB; the Docker build raises this to 4
    // (GILDRA_BUILD_CPUS in the Dockerfile).
    cpus: Number(process.env.GILDRA_BUILD_CPUS) || 2,
    staticGenerationMaxConcurrency: 2,
    cssChunking: { type: "graph", requestCost: 6000 },
    // Two root layouts (app/(site), app/ru) for a server-side <html lang>: the
    // 404 of unmatched URLs is app/global-not-found.tsx.
    globalNotFound: true,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost", "51.68.180.93", ...additionalDevOrigins],
  // The app lives in apps/web of the monorepo (roadmap item 81): bundling and
  // standalone tracing start at the repository root so packages/* and the
  // hoisted node_modules are inside it. The Dockerfile flattens the standalone
  // output back to /app/server.js.
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  poweredByHeader: false,
  // The Docker image checks types in a parallel stage (Dockerfile, typecheck),
  // which gates the image; next build then skips its own, serial pass.
  typescript: { ignoreBuildErrors: process.env.GILDRA_TYPECHECK_STAGE === "1" },
  async headers() {
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    const sameOriginFrames = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    return [
      { source: "/:path*", headers: [...security, ...sameOriginFrames] },
    ];
  },
  async redirects() {
    return [
      { source: "/lairs", destination: "/wow/lairs", permanent: true },
      { source: "/ru/lairs", destination: "/ru/wow/lairs", permanent: true },
      { source: "/wow/mythic", destination: "/wow/mythic-plus", permanent: true },
      { source: "/ru/wow/mythic", destination: "/ru/wow/mythic-plus", permanent: true },
      { source: "/wow/mythic/:dungeon", destination: "/wow/mythic-plus/midnight-season-2/:dungeon", permanent: true },
      { source: "/ru/wow/mythic/:dungeon", destination: "/ru/wow/mythic-plus/midnight-season-2/:dungeon", permanent: true },
      // The story library is Russian-only (lib/routes/registry.ts `only`).
      { source: "/wow/stories", destination: "/ru/wow/stories", permanent: true },
      ...misplacedWowBossRedirects.flatMap(([slug, destination]) => [
        { source: `/wow/lairs/${slug}`, destination: `/wow/${destination}`, permanent: true },
        { source: `/ru/wow/lairs/${slug}`, destination: `/ru/wow/${destination}`, permanent: true },
      ]),
      ...legacyWowSpecRedirects.flatMap(([slug, destination]) => [
        // Straight to the talent tree: /wow/classes/<class>/<spec> itself redirects there (area B).
        { source: `/specs/${slug}`, destination: `/talents/${destination.split("/")[1]}`, permanent: true },
        { source: `/ru/specs/${slug}`, destination: `/ru/talents/${destination.split("/")[1]}`, permanent: true },
      ]),
    ];
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://api:8080";
    return [
      // IndexNow key file (/<INDEXNOW_KEY>.txt); static files and app routes such as /robots.txt win first.
      { source: "/:file([A-Za-z0-9-]{8,128}\\.txt)", destination: "/indexnow/:file" },
      { source: "/v1/media/:path*", destination: `${api}/v1/media/:path*` },
      { source: "/genshin-impact/media/:path*", destination: `${api}/genshin-impact/media/:path*` },
      { source: "/league-of-legends/v1/:path*", destination: `${api}/league-of-legends/v1/:path*` },
      { source: "/league-of-legends/media/:path*", destination: `${api}/league-of-legends/media/:path*` },
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/livez", destination: `${api}/livez` },
      { source: "/readyz", destination: `${api}/readyz` },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // No `tunnelRoute`: it only tunnels sentry.io DSNs. Browser reports go to
  // GlitchTip through app/monitoring/route.ts (instrumentation-client.ts).
});
