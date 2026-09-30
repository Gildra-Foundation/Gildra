import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingIncludes: {
    "/talents/[spec]": ["./app/styles/talents/specs/**/*.css"],
    "/ru/talents/[spec]": ["./app/styles/talents/specs/**/*.css"],
  },
  images: {
    qualities: [75, 90],
  },
  allowedDevOrigins: ["127.0.0.1", "localhost", "51.68.180.93", ...additionalDevOrigins],
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      { source: "/wow/mythic", destination: "/wow/mythic-plus", permanent: true },
      { source: "/ru/wow/mythic", destination: "/ru/wow/mythic-plus", permanent: true },
      { source: "/wow/mythic/:dungeon", destination: "/wow/mythic-plus/midnight-season-2/:dungeon", permanent: true },
      { source: "/ru/wow/mythic/:dungeon", destination: "/ru/wow/mythic-plus/midnight-season-2/:dungeon", permanent: true },
      ...misplacedWowBossRedirects.flatMap(([slug, destination]) => [
        { source: `/wow/lairs/${slug}`, destination: `/wow/${destination}`, permanent: true },
        { source: `/ru/wow/lairs/${slug}`, destination: `/ru/wow/${destination}`, permanent: true },
      ]),
      ...legacyWowSpecRedirects.flatMap(([slug, destination]) => [
        { source: `/specs/${slug}`, destination: `/wow/classes/${destination}`, permanent: true },
        { source: `/ru/specs/${slug}`, destination: `/ru/wow/classes/${destination}`, permanent: true },
      ]),
    ];
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://api:8080";
    return [
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

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
