import type { Payload } from "payload";

/**
 * Imports a RiftDen MDX bundle (riftden-platform/scripts/cms/export-mdx.mjs)
 * into the shared CMS as DRAFT articles.
 *
 * - Runs as a real staff account with `overrideAccess: false`: the account
 *   needs an editor/admin role on the target site, and every editorial hook
 *   (site binding, same-site references, publishing rules) applies.
 * - Idempotent and non-destructive: an article whose slug already exists on
 *   the site (draft, published, edited by hand — anything) is skipped, never
 *   updated. Re-running an import only creates what is still missing.
 * - Rejected bundle entries (unsupported MDX components etc.) are reported and
 *   never imported; their MDX stays the source on the site.
 * - Dry run unless `apply` is true.
 */
type LexicalDoc = { root: Record<string, unknown> };
type BundleLocale = { title: string; summary: string; content: LexicalDoc };
export type BundleArticle = {
  slug: string;
  status: "ready" | "rejected";
  problems: string[];
  locales: Partial<Record<"en" | "ru", BundleLocale>>;
  shared: {
    category: string | null;
    publishedAt: string | null;
    featured: boolean;
    lolChampion: string | null;
    lolMentionedChampions: string[];
  } | null;
};
export type Bundle = { format: string; site: string; articles: BundleArticle[] };

export type ImportOutcome = { slug: string; action: "create" | "created" | "skip-exists" | "skip-rejected"; detail?: string; id?: number | string };

const CATEGORY_TITLES: Record<string, { en: string; ru: string }> = {
  mechanics: { en: "Mechanics", ru: "Механики" },
  macro: { en: "Macro", ru: "Макро" },
  beginners: { en: "Beginners", ru: "Новичкам" },
  analytics: { en: "Analytics", ru: "Аналитика" },
};
const FEATURED_TAG = { slug: "featured", en: "Featured", ru: "Избранное" };

export function validateBundle(value: unknown): Bundle {
  const bundle = value as Bundle;
  if (!bundle || bundle.format !== "riftden-mdx-bundle/1" || !Array.isArray(bundle.articles)) {
    throw new Error("Not a riftden-mdx-bundle/1 file.");
  }
  for (const a of bundle.articles) {
    if (typeof a.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) throw new Error(`Invalid slug in bundle: ${String(a.slug)}`);
  }
  return bundle;
}

async function ensureTerm(
  payload: Payload,
  user: Record<string, unknown>,
  collection: "categories" | "tags",
  site: number | string,
  slug: string,
  titles: { en: string; ru: string },
): Promise<number | string> {
  const found = await payload.find({ collection, where: { and: [{ site: { equals: site } }, { slug: { equals: slug } }] }, limit: 1, depth: 0, overrideAccess: false, user: user as never });
  if (found.docs[0]) return found.docs[0].id;
  const created = await payload.create({ collection, data: { site, slug, title: titles.en } as never, locale: "en", overrideAccess: false, user: user as never });
  await payload.update({ collection, id: created.id, data: { title: titles.ru }, locale: "ru", overrideAccess: false, user: user as never });
  return created.id;
}

export async function importBundle(
  payload: Payload,
  bundle: Bundle,
  options: { site: string; staffEmail: string; apply: boolean },
): Promise<ImportOutcome[]> {
  const sites = await payload.find({ collection: "sites", where: { slug: { equals: options.site } }, limit: 1, depth: 0, overrideAccess: true });
  const site = sites.docs[0];
  if (!site) throw new Error(`Unknown site "${options.site}".`);
  if (bundle.site !== options.site) throw new Error(`Bundle is for "${bundle.site}", not "${options.site}".`);
  const staff = await payload.find({ collection: "admins", where: { email: { equals: options.staffEmail.toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true });
  if (!staff.docs[0]) throw new Error(`No staff account ${options.staffEmail}.`);
  const user = { ...staff.docs[0], collection: "admins" };

  const outcomes: ImportOutcome[] = [];
  for (const article of bundle.articles) {
    if (article.status !== "ready" || !article.locales.en || !article.shared) {
      outcomes.push({ slug: article.slug, action: "skip-rejected", detail: article.problems.join("; ") || "incomplete entry" });
      continue;
    }
    // Any existing document with this slug on the site (any status) is left untouched.
    const existing = await payload.find({
      collection: "guides",
      where: { and: [{ site: { equals: site.id } }, { slug: { equals: article.slug } }] },
      draft: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.docs[0]) {
      outcomes.push({ slug: article.slug, action: "skip-exists", id: existing.docs[0].id, detail: `status ${existing.docs[0]._status ?? "draft"}` });
      continue;
    }
    if (!options.apply) {
      outcomes.push({ slug: article.slug, action: "create", detail: `draft with locales ${Object.keys(article.locales).sort().join("+")}` });
      continue;
    }

    const shared = article.shared;
    const categories = shared.category && CATEGORY_TITLES[shared.category] ? [await ensureTerm(payload, user, "categories", site.id, shared.category, CATEGORY_TITLES[shared.category])] : [];
    const tags = shared.featured ? [await ensureTerm(payload, user, "tags", site.id, FEATURED_TAG.slug, FEATURED_TAG)] : [];
    const en = article.locales.en;
    const created = await payload.create({
      collection: "guides",
      draft: true,
      locale: "en",
      overrideAccess: false,
      user: user as never,
      data: {
        site: site.id,
        slug: article.slug,
        title: en.title,
        summary: en.summary,
        content: en.content,
        author: user.id,
        categories,
        tags,
        publishedAt: shared.publishedAt,
        gameContext: { lolChampion: shared.lolChampion, lolMentionedChampions: shared.lolMentionedChampions },
      } as never,
    });
    for (const locale of ["ru"] as const) {
      const text = article.locales[locale];
      if (!text) continue;
      await payload.update({
        collection: "guides",
        id: created.id,
        draft: true,
        locale,
        overrideAccess: false,
        user: user as never,
        data: { title: text.title, summary: text.summary, content: text.content } as never,
      });
    }
    outcomes.push({ slug: article.slug, action: "created", id: created.id, detail: "draft" });
  }
  return outcomes;
}
