import type { RevalidationBody } from "./revalidation";

/**
 * Static (○) routes rendered from a block page config that a published CMS
 * `pages` document can override (components/blocks/Page.tsx). A build made
 * without CMS_INTERNAL_URL prerenders them without any tagged CMS fetch, so tag
 * invalidation cannot reach them; the receiver therefore also revalidates these
 * routes by path. Keep in sync with the app/** routes that render
 * lib/games/wow/pages/*.ts configs (today: tier-lists and privacy).
 */
export type PathPlan = { path: string }[];

const PAGE_ROUTES: Record<string, PathPlan> = {
  "wow/tier-lists": [{ path: "/tier-lists" }, { path: "/ru/tier-lists" }],
  "wow/privacy": [{ path: "/privacy" }, { path: "/ru/privacy" }],
};

export function planPathInvalidation(body: RevalidationBody): PathPlan {
  if (body.collection !== "pages") return [];
  const plan: PathPlan = [];
  for (const slug of [body.slug, body.previousSlug]) {
    for (const route of (slug && PAGE_ROUTES[slug]) || []) {
      if (!plan.some((p) => p.path === route.path)) plan.push(route);
    }
  }
  return plan;
}
