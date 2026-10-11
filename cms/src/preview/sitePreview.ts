import type { PayloadRequest } from "payload";

import { relationID } from "../access/roles";
import { sitePreviewUrl } from "../admin/sitePaths";
import { signPreview, signSitePreview } from "./token";

type Collection = "guides" | "pages";
type SiteRef = { slug: string; publicUrl: string };

/**
 * Sites whose frontend has a draft preview page (`CMS_SITE_PREVIEW`, comma
 * separated slugs, e.g. "riftden,gildra"). Other sites keep the CMS-side
 * preview, so a site is switched over only once its page is deployed.
 */
export function nativePreviewSites(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.CMS_SITE_PREVIEW ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const SITE_CACHE_MS = 60_000;
const siteCache = new Map<string, { site: SiteRef | null; at: number }>();

/** Sites change rarely; the live preview URL is recomputed on every autosave. */
async function siteRef(req: PayloadRequest, id: string): Promise<SiteRef | null> {
  const hit = siteCache.get(id);
  if (hit && Date.now() - hit.at < SITE_CACHE_MS) return hit.site;
  const doc = (await req.payload
    .findByID({ collection: "sites", id, depth: 0, overrideAccess: true, disableErrors: true })
    .catch(() => null)) as { slug?: unknown; publicUrl?: unknown } | null;
  const site =
    doc && typeof doc.slug === "string" && typeof doc.publicUrl === "string" ? { slug: doc.slug, publicUrl: doc.publicUrl } : null;
  siteCache.set(id, { site, at: Date.now() });
  return site;
}

type Args = { collection: Collection; doc: Record<string, unknown>; locale: string; req: PayloadRequest };

function claimsFor({ collection, doc, req }: Args) {
  const user = req.user as { collection?: string; id?: unknown } | undefined;
  const site = relationID(doc.site);
  if (!user || user.collection !== "admins" || site === null || doc.id === undefined || doc.id === null) return null;
  return { c: collection, id: String(doc.id), site: String(site), uid: String(user.id) };
}

/** Draft preview on the site itself when that site supports it (articles only). */
export async function sitePreviewTarget(args: Args): Promise<string | null> {
  const claims = claimsFor(args);
  if (!claims || args.collection !== "guides") return null;
  const site = await siteRef(args.req, claims.site);
  if (!site || !nativePreviewSites().has(site.slug)) return null;
  return sitePreviewUrl(site, args.locale, signSitePreview(claims));
}

/** `admin.preview`: the site's own preview page, else the CMS-side preview page. */
export async function previewTarget(args: Args): Promise<string | null> {
  const native = await sitePreviewTarget(args);
  if (native) return native;
  const claims = claimsFor(args);
  if (!claims) return null;
  const base = (process.env.PAYLOAD_PUBLIC_URL ?? "").replace(/\/$/, "");
  return `${base}/preview/${args.collection}/${args.doc.id}?locale=${encodeURIComponent(args.locale)}&token=${encodeURIComponent(signPreview(claims))}`;
}
