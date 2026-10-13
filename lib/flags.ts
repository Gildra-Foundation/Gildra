/**
 * Feature flags of the web app in one place (roadmap item 87). Two kinds:
 *
 *  - product switches, decided in code review (`flags`): flipping one is a
 *    product decision and ships with a release;
 *  - runtime switches read from the environment (`runtimeFlags()`): set per
 *    deployment in /opt/gildra/.env; their variables are listed and validated in
 *    lib/env.ts (except the development-only gallery flag).
 *
 * Code reads flags from here, never `process.env.*_ENABLED` directly. `flags`
 * is safe anywhere; `runtimeFlags()` is for proxy.ts and server code (client
 * components keep a literal `process.env.NODE_ENV`, which the bundler inlines).
 */
export const flags = {
  /** Fixture pages without real data (/patches, /compare, /profile, /diablo, /genshin) go public. Games: MVP_VISIBLE_GAMES in lib/games/registry.ts. */
  deferredPagesPublic: false,
} as const;

type Env = Partial<Record<string, string | undefined>>;

export function runtimeFlags(env: Env = process.env) {
  return {
    /** Dev galleries /dev/blocks and /dev/atlas: always in development, in production only with GILDRA_DEV_GALLERY=1. */
    devGallery: env.NODE_ENV !== "production" || env.GILDRA_DEV_GALLERY === "1",
    /** Live WoW meta (tier lists, popularity) from the Gildra API instead of the honest "not yet" state. */
    wowMetaApi: env.WOW_META_API_ENABLED === "true",
    /** Landing page data from the API instead of the built-in copy. */
    platformHomeApi: env.PLATFORM_HOME_API_ENABLED === "true",
    /** Catalog and library readable without an account. */
    catalogPublic: (env.CATALOG_ACCESS_MODE ?? "private").toLowerCase() === "public",
    /** Intent prefetch of routes (off in development, where every prefetch compiles a page). */
    routePrefetch: env.NODE_ENV !== "development",
    /** Staging copy of the site (GILDRA_STAGING=1): never indexed, no analytics, a visible badge. */
    staging: env.GILDRA_STAGING === "1",
  };
}
