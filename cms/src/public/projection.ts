import type { PayloadRequest } from "payload";

import { type ID, relationID } from "../access/roles";

/**
 * Stable public shapes. Every field is copied explicitly, so adding a private
 * field to a collection can never leak through these endpoints.
 */

export type PublicMedia = { id: ID; url: string | null; alt: string | null; caption: string | null; width: number | null; height: number | null; mimeType: string | null };
export type PublicTerm = { id: ID; slug: string; title: string };

type Doc = Record<string, unknown>;

const strOrNull = (v: unknown) => (typeof v === "string" && v.length ? v : null);
const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);

export function projectMedia(doc: Doc | null | undefined): PublicMedia | null {
  if (!doc || typeof doc !== "object" || doc.id === undefined) return null;
  return {
    id: doc.id as ID,
    url: strOrNull(doc.url),
    alt: strOrNull(doc.alt),
    caption: strOrNull(doc.caption),
    width: numOrNull(doc.width),
    height: numOrNull(doc.height),
    mimeType: strOrNull(doc.mimeType),
  };
}

export function projectTerm(doc: unknown): PublicTerm | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Doc;
  return typeof d.slug === "string" ? { id: d.id as ID, slug: d.slug, title: String(d.title ?? d.slug) } : null;
}

export type RefResolver = {
  media: Map<string, PublicMedia>;
  docs: Map<string, { relationTo: string; id: ID; slug: string }>;
};

/** Collect IDs referenced from Lexical content so they can be resolved in one query each. */
function collectRefs(value: unknown, media: Set<string>, docs: Map<string, Set<string>>, depth = 0) {
  if (!value || typeof value !== "object" || depth > 64) return;
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, media, docs, depth + 1);
    return;
  }
  const node = value as Doc;
  if (node.type === "upload" && node.relationTo === "media") {
    const id = relationID(node.value);
    if (id !== null) media.add(String(id));
  }
  if (node.type === "relationship" && typeof node.relationTo === "string") {
    const id = relationID(node.value);
    if (id !== null) docs.set(node.relationTo, (docs.get(node.relationTo) ?? new Set()).add(String(id)));
  }
  const linkDoc = (node.fields as Doc | undefined)?.doc as { relationTo?: unknown; value?: unknown } | undefined;
  if ((node.type === "link" || node.type === "autolink") && linkDoc && typeof linkDoc.relationTo === "string") {
    const id = relationID(linkDoc.value);
    if (id !== null) docs.set(linkDoc.relationTo, (docs.get(linkDoc.relationTo) ?? new Set()).add(String(id)));
  }
  for (const child of Object.values(node)) collectRefs(child, media, docs, depth + 1);
}

/** Resolve referenced media/documents, keeping only same-site media and published same-site documents. */
export async function buildResolver(req: PayloadRequest, site: ID, contents: unknown[], extraMedia: unknown[] = []): Promise<RefResolver> {
  const mediaIDs = new Set<string>();
  for (const ref of extraMedia) {
    const id = relationID(ref);
    if (id !== null) mediaIDs.add(String(id));
  }
  const docIDs = new Map<string, Set<string>>();
  for (const content of contents) collectRefs(content, mediaIDs, docIDs);
  const resolver: RefResolver = { media: new Map(), docs: new Map() };

  if (mediaIDs.size) {
    const { docs } = await req.payload.find({
      collection: "media",
      where: { and: [{ id: { in: [...mediaIDs] } }, { site: { equals: site } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      locale: req.locale ?? undefined,
    });
    for (const doc of docs) resolver.media.set(String(doc.id), projectMedia(doc as unknown as Doc)!);
  }
  for (const [collection, ids] of docIDs) {
    if (collection !== "guides" && collection !== "pages") continue;
    const { docs } = await req.payload.find({
      collection,
      where: { and: [{ id: { in: [...ids] } }, { site: { equals: site } }, { _status: { equals: "published" } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { slug: true },
    });
    for (const doc of docs) resolver.docs.set(`${collection}:${doc.id}`, { relationTo: collection, id: doc.id, slug: String(doc.slug) });
  }
  return resolver;
}

/**
 * Copy Lexical JSON, replacing upload/relationship/link references with the
 * public projections above. References that are unpublished, missing or from
 * another site are dropped instead of leaking.
 */
export function sanitizeRichText(value: unknown, resolver: RefResolver, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 64) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRichText(item, resolver, depth + 1)).filter((item) => item !== undefined);
  }
  const node = value as Doc;
  if (node.type === "upload") {
    const media = resolver.media.get(String(relationID(node.value)));
    return media ? { type: "upload", version: node.version, relationTo: "media", value: media, fields: node.fields ?? null } : undefined;
  }
  if (node.type === "relationship") {
    const ref = resolver.docs.get(`${String(node.relationTo)}:${String(relationID(node.value))}`);
    return ref ? { type: "relationship", version: node.version, relationTo: ref.relationTo, value: ref } : undefined;
  }
  const out: Doc = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === "fields" && (node.type === "link" || node.type === "autolink") && child && typeof child === "object") {
      const fields = { ...(child as Doc) };
      const linkDoc = fields.doc as { relationTo?: unknown; value?: unknown } | undefined;
      if (linkDoc) {
        const ref = resolver.docs.get(`${String(linkDoc.relationTo)}:${String(relationID(linkDoc.value))}`);
        fields.doc = ref ?? null;
      }
      out[key] = fields;
      continue;
    }
    out[key] = sanitizeRichText(child, resolver, depth + 1);
  }
  return out;
}

/**
 * Reading time in minutes (200 words per minute, at least 1), counted like the
 * site frontends' `readingMinutes`: paragraph, heading, quote and list text
 * plus callout/table captions. Lets cards and lists skip the article body.
 */
export function readingMinutes(content: unknown): number {
  let words = 0;
  const text = (node: Doc | undefined, depth: number): string => {
    if (!node || depth > 64) return "";
    if (node.type === "text" && typeof node.text === "string") return node.text;
    if (node.type === "linebreak") return " ";
    return ((node.children as Doc[] | undefined) ?? []).map((c) => text(c, depth + 1)).join("");
  };
  const walk = (node: Doc | undefined, depth: number) => {
    if (!node || typeof node !== "object" || depth > 64) return;
    if (["paragraph", "heading", "quote", "listitem"].includes(String(node.type))) {
      words += text(node, depth).split(/\s+/).filter(Boolean).length;
      return;
    }
    if (node.type === "block") {
      const f = (node.fields ?? {}) as Doc;
      words += [f.title, f.body, f.caption].filter((v) => typeof v === "string").join(" ").split(/\s+/).filter(Boolean).length;
      return;
    }
    for (const child of (node.children as Doc[] | undefined) ?? []) walk(child, depth + 1);
  };
  walk((content as { root?: Doc } | null | undefined)?.root, 0);
  return Math.max(1, Math.round(words / 200));
}

export function projectArticle(doc: Doc, resolver: RefResolver, terms: { categories: Map<string, PublicTerm>; tags: Map<string, PublicTerm> }, withContent: boolean) {
  const seo = (doc.seo ?? {}) as Doc;
  const game = (doc.gameContext ?? {}) as Doc;
  const author = doc.author && typeof doc.author === "object" ? (doc.author as Doc) : null;
  const pick = (map: Map<string, PublicTerm>, list: unknown) =>
    (Array.isArray(list) ? list : []).map((item) => map.get(String(relationID(item)))).filter(Boolean) as PublicTerm[];
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title ?? null,
    summary: doc.summary ?? null,
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
    readingTime: readingMinutes(doc.content),
    legacyCategory: doc.category ?? null,
    cover: resolver.media.get(String(relationID(doc.hero))) ?? null,
    author: author ? { name: strOrNull(author.name) } : null,
    categories: pick(terms.categories, doc.categories),
    tags: pick(terms.tags, doc.tags),
    game: {
      patch: game.patch ?? null,
      season: game.season ?? null,
      lastReviewedAt: game.lastReviewedAt ?? null,
      wowClass: game.wowClass ?? null,
      wowSpec: game.wowSpec ?? null,
      wowInstance: game.wowInstance ?? null,
      lolChampion: game.lolChampion ?? null,
      lolRole: game.lolRole ?? null,
      lolMentionedChampions: Array.isArray(game.lolMentionedChampions) ? game.lolMentionedChampions : [],
    },
    seo: {
      title: seo.title ?? null,
      description: seo.description ?? null,
      image: resolver.media.get(String(relationID(seo.image))) ?? null,
      noIndex: seo.noIndex === true,
    },
    ...(withContent ? { content: sanitizeRichText(doc.content, resolver) } : {}),
  };
}

export function projectPage(doc: Doc, resolver: RefResolver) {
  const seo = (doc.seo ?? {}) as Doc;
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title ?? null,
    summary: doc.summary ?? null,
    game: doc.game ?? null,
    path: doc.path ?? null,
    layout: doc.layout ?? null,
    blocks: doc.blocks ?? null,
    content: sanitizeRichText(doc.content, resolver),
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
    seo: {
      title: seo.title ?? null,
      description: seo.description ?? null,
      image: resolver.media.get(String(relationID(seo.image))) ?? null,
      noIndex: seo.noIndex === true,
    },
  };
}


// ---------------------------------------------------------------------------
// Translation availability
// ---------------------------------------------------------------------------

export const PUBLIC_LOCALES = ["en", "ru"] as const;
export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

/** True when Lexical JSON contains visible text, an image or a block. */
export function hasRichContent(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 64) return false;
  if (Array.isArray(value)) return value.some((item) => hasRichContent(item, depth + 1));
  const node = value as Doc;
  if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) return true;
  if (node.type === "upload" || node.type === "block" || node.type === "relationship") return true;
  return Object.values(node).some((child) => hasRichContent(child, depth + 1));
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/**
 * Locales in which an article really exists: title, summary and body are all
 * stored for that locale. `byLocale` is the `locale: "all"` shape
 * (`{ title: { en, ru }, … }`) of the version being served.
 */
export function availableLocales(byLocale: Doc): PublicLocale[] {
  const field = (name: string, locale: string) => ((byLocale[name] ?? {}) as Doc)[locale];
  return PUBLIC_LOCALES.filter(
    (locale) => filled(field("title", locale)) && filled(field("summary", locale)) && hasRichContent(field("content", locale)),
  );
}

/** Requested locale when it exists, else English (the read fallback), else whatever exists. */
export function resolveLocale(requested: PublicLocale, available: PublicLocale[]): PublicLocale | null {
  if (available.includes(requested)) return requested;
  if (available.includes("en")) return "en";
  return available[0] ?? null;
}
