// Shared CMS contract, mirrored in riftden-platform/apps/lol/src/lib/cms; keep both copies identical.
/**
 * Public projection served by the shared Payload CMS (`/api/public/:site/...`).
 * Only these fields exist publicly; the frontend never talks to Payload's
 * collection REST API for content. Keep in sync with cms/src/public/projection.ts.
 */
export type CmsLocale = "en" | "ru";

export type PublicMedia = {
  id: number | string;
  url: string | null;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
};

export type PublicTerm = { id: number | string; slug: string; title: string };

/** Lexical JSON as sanitised by the CMS projection (references already resolved). */
export type RichTextNode = {
  type?: string;
  version?: number;
  tag?: string;
  text?: string;
  format?: number | string;
  listType?: string;
  start?: number;
  checked?: boolean;
  children?: RichTextNode[];
  fields?: Record<string, unknown> | null;
  relationTo?: string;
  value?: unknown;
  [key: string]: unknown;
};
export type RichTextDocument = { root?: RichTextNode } | null | undefined;

export type PublicArticle = {
  id: number | string;
  slug: string;
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Minutes, computed by the CMS from the body (lists omit the body itself). */
  readingTime?: number;
  legacyCategory: string | null;
  cover: PublicMedia | null;
  author: { name: string | null } | null;
  categories: PublicTerm[];
  tags: PublicTerm[];
  game: {
    patch: string | null;
    season: string | null;
    lastReviewedAt: string | null;
    wowClass: string | null;
    wowSpec: string | null;
    wowInstance: string | null;
    lolChampion: string | null;
    lolRole: string | null;
    lolMentionedChampions: string[];
  };
  seo: { title: string | null; description: string | null; image: PublicMedia | null; noIndex: boolean };
  content?: RichTextDocument;
  requestedLocale: CmsLocale;
  /** Locale whose text is actually returned (requested, else English, else any). */
  resolvedLocale: CmsLocale | null;
  /** Locales with stored title, summary and body in the served (published) version. */
  availableLocales: CmsLocale[];
};

export type PublicArticleList = { docs: PublicArticle[]; page: number; limit: number; totalDocs: number; totalPages: number };

export type PublicPage = {
  id: number | string;
  slug: string;
  title: string | null;
  summary: string | null;
  game: string | null;
  path: string | null;
  layout: string | null;
  blocks: unknown;
  content: RichTextDocument;
  publishedAt: string | null;
  updatedAt: string | null;
  seo: { title: string | null; description: string | null; image: PublicMedia | null; noIndex: boolean };
};
