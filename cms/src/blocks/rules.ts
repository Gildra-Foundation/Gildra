import { type CollectionBeforeChangeHook, type JSONFieldValidation, type PayloadRequest, type TextFieldSingleValidation, ValidationError } from "payload";

import { relationID } from "../access/roles";
import { findPage, pageLabel, pagesForSite, type Lang } from "./contract";
import { checkBlocks, formatIssue } from "./validate";

/**
 * Server rules of the `pages` collection: the page id comes from the site's
 * list of overridable pages, `game`/`path` follow from it, and `blocks` must
 * pass the same contract as the site. Blocks are checked on every save,
 * drafts and autosaves included, so a broken value never reaches a version
 * that could later be published.
 */
const SITE_CACHE_MS = 60_000;
const siteCache = new Map<string, { slug: string | null; at: number }>();

export async function siteSlugOf(req: PayloadRequest, site: unknown): Promise<string | null> {
  const id = relationID(site as never);
  if (id === null) return null;
  if (typeof site === "object" && site !== null && typeof (site as { slug?: unknown }).slug === "string") return (site as { slug: string }).slug;
  const key = String(id);
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < SITE_CACHE_MS) return hit.slug;
  const doc = (await req.payload.findByID({ collection: "sites", id, depth: 0, overrideAccess: true, disableErrors: true }).catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof doc?.slug === "string" ? doc.slug : null;
  siteCache.set(key, { slug, at: Date.now() });
  return slug;
}

export const langOf = (req: PayloadRequest): Lang => (req.i18n?.language === "ru" ? "ru" : "en");

const MAX_MESSAGES = 8;

/** Readable messages for a blocks value on a page (empty when valid). */
export async function blockMessages(req: PayloadRequest, site: unknown, slug: unknown, value: unknown): Promise<string[]> {
  const page = findPage(await siteSlugOf(req, site), slug);
  // Legacy documents outside the list stay editable; their blocks still have to be known blocks.
  const issues = checkBlocks(value, page ? page.blocks : null);
  const lang = langOf(req);
  const messages = issues.slice(0, MAX_MESSAGES).map((issue) => formatIssue(issue, lang));
  if (issues.length > MAX_MESSAGES) messages.push(lang === "ru" ? `…и ещё ${issues.length - MAX_MESSAGES}.` : `…and ${issues.length - MAX_MESSAGES} more.`);
  return messages;
}

const jsonReason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Inline error under the blocks editor while editing. */
export const validateBlocksField: JSONFieldValidation = async (value, { data, req, jsonError }) => {
  const doc = (data ?? {}) as { site?: unknown; slug?: unknown };
  if (jsonError) return langOf(req) === "ru" ? `Блоки: JSON не читается (${jsonReason(jsonError)}).` : `Blocks: invalid JSON (${jsonReason(jsonError)}).`;
  const messages = await blockMessages(req, doc.site, doc.slug, value);
  return messages.length ? messages.join("\n") : true;
};

/** Why a page id is not one of the site's overridable pages (null when it is). */
function pageIdError(value: unknown, site: string | null, lang: Lang): string | null {
  const ru = lang === "ru";
  if (typeof value !== "string" || value.length === 0) return ru ? "Выберите страницу сайта." : "Choose a site page.";
  if (findPage(site, value)) return null;
  const ids = pagesForSite(site).map((page) => page.id).join(", ");
  return ru
    ? `Страницу «${value}» нельзя переопределить из CMS. Доступны: ${ids || "нет"}.`
    : `Page "${value}" cannot be overridden from the CMS. Available: ${ids || "none"}.`;
}

/** The page id must be one of the site's overridable pages; legacy ids stay valid while unchanged. */
export const validatePageId: TextFieldSingleValidation = async (value, { data, previousValue, req }) => {
  if (value && value === previousValue) return true;
  return pageIdError(value, await siteSlugOf(req, (data as { site?: unknown } | undefined)?.site), langOf(req)) ?? true;
};

export const enforcePageRules: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const lang = langOf(req);
  const slug = data.slug ?? originalDoc?.slug;
  if (operation === "update" && originalDoc?.slug !== undefined && data.slug !== undefined && data.slug !== originalDoc.slug) {
    throw new ValidationError({
      collection: "pages",
      errors: [{ path: "slug", message: lang === "ru" ? "Страницу сайта нельзя сменить после создания: создайте новый документ." : "The site page cannot change after creation; create a new document." }],
    });
  }
  const site = await siteSlugOf(req, data.site ?? originalDoc?.site);
  const page = findPage(site, slug);
  if (!page && operation === "create") {
    throw new ValidationError({ collection: "pages", errors: [{ path: "slug", message: pageIdError(slug, site, lang) ?? "" }] });
  }
  if (page) {
    data.game = page.game;
    data.path = page.path;
    if (operation === "create" && !data.title) data.title = pageLabel(page.id, req.locale === "ru" ? "ru" : "en");
  }
  if ("blocks" in data) {
    const messages = await blockMessages(req, data.site ?? originalDoc?.site, slug, data.blocks);
    if (messages.length) throw new ValidationError({ collection: "pages", errors: [{ path: "blocks", message: messages.join("\n") }] });
  }
  return data;
};
