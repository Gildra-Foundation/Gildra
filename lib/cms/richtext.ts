// Shared CMS contract, mirrored in riftden-platform/apps/lol/src/lib/cms; keep both copies identical.
/**
 * Safe renderer for CMS rich text (Lexical JSON from the public projection).
 *
 * - Only the node types enabled in the CMS editor are rendered; anything else
 *   renders its children (or nothing). No HTML string is ever injected: all
 *   text goes through React's escaping.
 * - Links are allow-listed (relative paths, #anchors, http(s), mailto);
 *   `javascript:`, `data:`, `vbscript:` and protocol-relative URLs are dropped.
 * - Images render only from server-configured media origins.
 * - Headings get stable ids (same algorithm as `extractToc`).
 *
 * Written with `createElement` (no JSX) so it runs in plain Node tests and in
 * both site frontends without the CMS server bundle.
 */
import { createElement as h, Fragment, type ReactNode } from "react";

import type { PublicMedia, RichTextDocument, RichTextNode } from "./contract.ts";

// Lexical text format bit flags.
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const UNDERLINE = 8;
const CODE = 16;
const SUBSCRIPT = 32;
const SUPERSCRIPT = 64;

const MAX_DEPTH = 40;

export type RichTextClassKey =
  | "prose"
  | "callout"
  | "calloutTitle"
  | "calloutBody"
  | "table"
  | "tableWrap"
  | "figure"
  | "image"
  | "caption"
  | "quote"
  | "code";

export type RichTextOptions = {
  /** Origins images may be loaded from (e.g. the CMS public origin). */
  mediaOrigins: string[];
  /** Base used for media URLs that the CMS returns as paths (`/api/media/file/...`). */
  mediaBase?: string;
  /** Href for an internal CMS document reference; null renders plain text. */
  resolveDocHref?: (relationTo: string, slug: string) => string | null;
  /** Adapts site-relative links to the reader's locale (e.g. `/raids` → `/ru/raids`). */
  localizeHref?: (href: string) => string;
  /** Labels for callout tones in the reader's language. */
  calloutLabels?: Partial<Record<"info" | "tip" | "warning", string>>;
  /** Extra class for a callout tone (defaults to `cms-callout--<tone>`). */
  calloutToneClass?: (tone: "info" | "tip" | "warning") => string | undefined;
  classNames?: Partial<Record<RichTextClassKey, string>>;
};

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

const hasControlOrBackslash = (value: string) =>
  [...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f || c === "\\");

/** Allow-listed href or null. Relative paths, #anchors, http(s) and mailto only. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 2048 || hasControlOrBackslash(value)) return null;
  if (value.startsWith("#")) return value;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  if (value.startsWith("?")) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" ? url.href : null;
}

/** Absolute image URL from an allowed origin, or null. */
export function safeMediaUrl(raw: unknown, mediaOrigins: string[], mediaBase?: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = raw.startsWith("/") && !raw.startsWith("//") && mediaBase ? new URL(raw, mediaBase) : new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const allowed = mediaOrigins.map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return null;
    }
  });
  return allowed.includes(url.origin) ? url.href : null;
}

// ---------------------------------------------------------------------------
// Text helpers, heading ids, table of contents
// ---------------------------------------------------------------------------

export function nodeText(node: RichTextNode | undefined, depth = 0): string {
  if (!node || depth > MAX_DEPTH) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (node.type === "linebreak") return " ";
  return (node.children ?? []).map((child) => nodeText(child, depth + 1)).join("");
}

/** Plain text of a whole document (reading time, descriptions, search). */
export function plainText(doc: RichTextDocument): string {
  const blocks: string[] = [];
  const walk = (node: RichTextNode | undefined, depth: number) => {
    if (!node || depth > MAX_DEPTH) return;
    if (["paragraph", "heading", "quote", "listitem"].includes(String(node.type))) {
      blocks.push(nodeText(node));
      return;
    }
    if (node.type === "block") {
      const f = (node.fields ?? {}) as Record<string, unknown>;
      blocks.push([f.title, f.body, f.caption].filter((v) => typeof v === "string").join(" "));
      return;
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(doc?.root, 0);
  return blocks.join("\n").trim();
}

/** github-slugger-like id: lowercase, letters/digits (any script), dashes; unique per document. */
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base =
      text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .slice(0, 80) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

function headingLevel(tag: unknown): 2 | 3 | 4 {
  const n = Number(String(tag ?? "h2").replace(/^h/, ""));
  // The page owns <h1>; CMS h1 becomes h2, h5/h6 collapse into h4.
  if (!Number.isFinite(n) || n <= 2) return 2;
  return n === 3 ? 3 : 4;
}

/** Headings in document order with the ids the renderer assigns. */
export function extractToc(doc: RichTextDocument, levels: (2 | 3)[] = [2]): TocItem[] {
  const slug = createSlugger();
  const out: TocItem[] = [];
  const walk = (node: RichTextNode | undefined, depth: number) => {
    if (!node || depth > MAX_DEPTH) return;
    if (node.type === "heading") {
      const text = nodeText(node).trim();
      const id = slug(text);
      const level = headingLevel(node.tag);
      if (text && (levels as number[]).includes(level)) out.push({ id, text, level: level as 2 | 3 });
      return;
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(doc?.root, 0);
  return out;
}

export function readingMinutes(doc: RichTextDocument, wordsPerMinute = 200): number {
  const words = plainText(doc).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type Ctx = RichTextOptions & { slug: (text: string) => string; key: number };

const cls = (ctx: Ctx, key: RichTextClassKey) => ctx.classNames?.[key];

function renderText(node: RichTextNode, key: number): ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  let el: ReactNode = node.text ?? "";
  if (format & CODE) el = h("code", { key }, el);
  if (format & BOLD) el = h("strong", { key }, el);
  if (format & ITALIC) el = h("em", { key }, el);
  if (format & UNDERLINE) el = h("u", { key }, el);
  if (format & STRIKETHROUGH) el = h("s", { key }, el);
  if (format & SUBSCRIPT) el = h("sub", { key }, el);
  if (format & SUPERSCRIPT) el = h("sup", { key }, el);
  return typeof el === "string" ? h(Fragment, { key }, el) : el;
}

function children(node: RichTextNode, ctx: Ctx, depth: number): ReactNode[] {
  return (node.children ?? []).map((child, i) => renderNode(child, ctx, depth + 1, i));
}

function linkHref(node: RichTextNode, ctx: Ctx): { href: string | null; external: boolean; newTab: boolean } {
  const f = (node.fields ?? {}) as { linkType?: string; url?: unknown; newTab?: unknown; doc?: { relationTo?: unknown; slug?: unknown } | null };
  if (f.linkType === "internal") {
    const doc = f.doc;
    const href =
      doc && typeof doc.relationTo === "string" && typeof doc.slug === "string" && ctx.resolveDocHref
        ? ctx.resolveDocHref(doc.relationTo, doc.slug)
        : null;
    return { href, external: false, newTab: false };
  }
  const safe = safeHref(f.url);
  if (!safe) return { href: null, external: false, newTab: false };
  const internal = safe.startsWith("/") && !safe.startsWith("//");
  return {
    href: internal && ctx.localizeHref ? ctx.localizeHref(safe) : safe,
    external: /^https?:/.test(safe),
    newTab: f.newTab === true,
  };
}

function renderMedia(media: PublicMedia | null | undefined, ctx: Ctx, key: number): ReactNode {
  const src = safeMediaUrl(media?.url, ctx.mediaOrigins, ctx.mediaBase);
  if (!media || !src) return null;
  const img = h("img", {
    key: "img",
    src,
    alt: media.alt ?? "",
    width: media.width ?? undefined,
    height: media.height ?? undefined,
    loading: "lazy",
    decoding: "async",
    className: cls(ctx, "image"),
  });
  return h(
    "figure",
    { key, className: cls(ctx, "figure") },
    img,
    media.caption ? h("figcaption", { key: "cap", className: cls(ctx, "caption") }, media.caption) : null,
  );
}

function renderBlock(node: RichTextNode, ctx: Ctx, key: number): ReactNode {
  const f = (node.fields ?? {}) as Record<string, unknown>;
  if (f.blockType === "callout") {
    const tone = f.tone === "tip" || f.tone === "warning" ? f.tone : "info";
    const title = typeof f.title === "string" && f.title.trim() ? f.title : ctx.calloutLabels?.[tone] ?? null;
    return h(
      "aside",
      { key, className: [cls(ctx, "callout"), ctx.calloutToneClass ? ctx.calloutToneClass(tone) : `cms-callout--${tone}`].filter(Boolean).join(" "), "data-tone": tone },
      title ? h("p", { key: "t", className: cls(ctx, "calloutTitle") }, title) : null,
      h("p", { key: "b", className: cls(ctx, "calloutBody"), style: { whiteSpace: "pre-line" } }, typeof f.body === "string" ? f.body : ""),
    );
  }
  if (f.blockType === "dataTable") {
    const columns = (Array.isArray(f.columns) ? f.columns : []).slice(0, 12).map((c) => String((c as { label?: unknown })?.label ?? ""));
    const rows = (Array.isArray(f.rows) ? f.rows : []).slice(0, 200).map((r) =>
      (Array.isArray((r as { cells?: unknown })?.cells) ? ((r as { cells: unknown[] }).cells) : [])
        .slice(0, columns.length || 12)
        .map((c) => String((c as { value?: unknown })?.value ?? "")),
    );
    if (!columns.length) return null;
    return h(
      "div",
      { key, className: cls(ctx, "tableWrap") },
      h(
        "table",
        { className: cls(ctx, "table") },
        typeof f.caption === "string" && f.caption ? h("caption", null, f.caption) : null,
        h("thead", null, h("tr", null, columns.map((c, i) => h("th", { key: i, scope: "col" }, c)))),
        h("tbody", null, rows.map((cells, r) => h("tr", { key: r }, columns.map((_, i) => h("td", { key: i }, cells[i] ?? ""))))),
      ),
    );
  }
  return null;
}

function renderNode(node: RichTextNode | undefined, ctx: Ctx, depth: number, key: number): ReactNode {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return null;
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "linebreak":
      return h("br", { key });
    case "tab":
      return h(Fragment, { key }, "\t");
    case "paragraph":
      return h("p", { key }, children(node, ctx, depth));
    case "heading": {
      const level = headingLevel(node.tag);
      return h(`h${level}`, { key, id: ctx.slug(nodeText(node).trim()) }, children(node, ctx, depth));
    }
    case "quote":
      return h("blockquote", { key, className: cls(ctx, "quote") }, children(node, ctx, depth));
    case "list": {
      const ordered = node.listType === "number" || node.tag === "ol";
      const start = ordered && typeof node.start === "number" && node.start > 1 ? node.start : undefined;
      return h(ordered ? "ol" : "ul", { key, start, "data-list": node.listType === "check" ? "check" : undefined }, children(node, ctx, depth));
    }
    case "listitem": {
      const checked = typeof node.checked === "boolean" ? node.checked : undefined;
      return h("li", { key, "aria-checked": checked, role: checked === undefined ? undefined : "checkbox" }, children(node, ctx, depth));
    }
    case "link":
    case "autolink": {
      const { href, external, newTab } = linkHref(node, ctx);
      if (!href) return h(Fragment, { key }, children(node, ctx, depth));
      return h(
        "a",
        { key, href, ...(newTab ? { target: "_blank" } : {}), ...(external || newTab ? { rel: "noopener noreferrer" } : {}) },
        children(node, ctx, depth),
      );
    }
    case "upload":
      return node.relationTo === "media" ? renderMedia(node.value as PublicMedia, ctx, key) : null;
    case "relationship": {
      const v = (node.value ?? {}) as { relationTo?: unknown; slug?: unknown };
      const href = typeof v.relationTo === "string" && typeof v.slug === "string" && ctx.resolveDocHref ? ctx.resolveDocHref(v.relationTo, v.slug) : null;
      return href ? h("p", { key }, h("a", { href }, String(v.slug))) : null;
    }
    case "horizontalrule":
      return h("hr", { key });
    case "block":
      return renderBlock(node, ctx, key);
    case "root":
      return h(Fragment, { key }, children(node, ctx, depth));
    default:
      // Unknown node: keep any text children, never raw markup.
      return node.children ? h(Fragment, { key }, children(node, ctx, depth)) : null;
  }
}

/** React tree for a CMS document. Heading ids match `extractToc`. */
export function renderRichText(doc: RichTextDocument, options: RichTextOptions): ReactNode {
  if (!doc || typeof doc !== "object" || !doc.root) return null;
  const ctx: Ctx = { ...options, slug: createSlugger(), key: 0 };
  return h("div", { className: cls(ctx, "prose") }, renderNode(doc.root, ctx, 0, 0));
}
