import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { RichTextDocument, RichTextNode } from "../../lib/cms/contract.ts";
import { extractToc, plainText, readingMinutes, renderRichText, safeHref, safeMediaUrl, videoEmbedUrl } from "../../lib/cms/richtext.ts";

const text = (value: string, format = 0): RichTextNode => ({ type: "text", text: value, format, version: 1 });
const para = (...children: RichTextNode[]): RichTextNode => ({ type: "paragraph", children });
const heading = (tag: string, value: string): RichTextNode => ({ type: "heading", tag, children: [text(value)] });
const doc = (...children: RichTextNode[]): RichTextDocument => ({ root: { type: "root", children } });
const link = (url: string, extra: Record<string, unknown> = {}): RichTextNode => ({
  type: "link",
  fields: { linkType: "custom", url, ...extra },
  children: [text("link")],
});

const OPTIONS = {
  mediaOrigins: ["https://cms.example.net"],
  mediaBase: "https://cms.example.net",
  resolveDocHref: (relationTo: string, slug: string) => (relationTo === "guides" ? `/wow/articles/${slug}` : null),
  localizeHref: (href: string) => `/ru${href}`,
};
const html = (d: RichTextDocument) => renderToStaticMarkup(renderRichText(d, OPTIONS) as never);

describe("safeHref", () => {
  it("allows relative, anchors, http(s) and mailto only", () => {
    assert.equal(safeHref("/wow/raids"), "/wow/raids");
    assert.equal(safeHref("#section"), "#section");
    assert.equal(safeHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
    assert.equal(safeHref("mailto:team@example.com"), "mailto:team@example.com");
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "//evil.example/x", "/\\evil.example", "java\nscript:alert(1)", "file:///etc/passwd", "", 42]) {
      assert.equal(safeHref(bad), null, String(bad));
    }
  });
});

describe("safeMediaUrl", () => {
  it("accepts only configured origins and resolves CMS paths against the media base", () => {
    assert.equal(safeMediaUrl("/api/media/file/a.png", OPTIONS.mediaOrigins, OPTIONS.mediaBase), "https://cms.example.net/api/media/file/a.png");
    assert.equal(safeMediaUrl("https://cms.example.net/api/media/file/a.png", OPTIONS.mediaOrigins), "https://cms.example.net/api/media/file/a.png");
    assert.equal(safeMediaUrl("https://evil.example/a.png", OPTIONS.mediaOrigins), null);
    assert.equal(safeMediaUrl("data:image/png;base64,AAAA", OPTIONS.mediaOrigins), null);
    assert.equal(safeMediaUrl("//cms.example.net/a.png", OPTIONS.mediaOrigins, OPTIONS.mediaBase), null);
    assert.equal(safeMediaUrl("/api/media/file/a.png", OPTIONS.mediaOrigins), null);
  });
});

describe("renderRichText", () => {
  it("escapes text and never emits script or unsafe URLs", () => {
    const out = html(
      doc(
        para(text('<script>alert("x")</script>'), link("javascript:alert(1)"), link("data:text/html,x")),
        { type: "upload", relationTo: "media", value: { id: 1, url: "https://evil.example/x.png", alt: "x", caption: null, width: 1, height: 1, mimeType: "image/png" } },
        { type: "html", value: "<img src=x onerror=alert(1)>" } as RichTextNode,
      ),
    );
    assert.ok(!out.includes("<script"), out);
    assert.ok(out.includes("&lt;script&gt;"), out);
    assert.ok(!/javascript:|data:/i.test(out), out);
    assert.ok(!out.includes("evil.example"), out);
    assert.ok(!out.includes("onerror"), out);
    assert.equal((out.match(/<a /g) ?? []).length, 0);
  });

  it("renders formatting, lists, quotes, links and safe images", () => {
    const out = html(
      doc(
        para(text("bold", 1), text(" italic", 2), text(" code", 16), text(" strike", 4)),
        { type: "list", listType: "number", tag: "ol", start: 3, children: [{ type: "listitem", children: [text("three")] }] },
        { type: "list", listType: "check", tag: "ul", children: [{ type: "listitem", checked: true, children: [text("done")] }] },
        { type: "quote", children: [text("quoted")] },
        para(link("/wow/raids"), link("https://example.com", { newTab: true })),
        para({ type: "link", fields: { linkType: "internal", doc: { relationTo: "guides", id: 4, slug: "mythic-plus" } }, children: [text("internal")] }),
        para({ type: "link", fields: { linkType: "internal", doc: null }, children: [text("unpublished target")] }),
        { type: "upload", relationTo: "media", value: { id: 2, url: "/api/media/file/p.png", alt: "Pic", caption: "Cap", width: 10, height: 5, mimeType: "image/png" } },
        { type: "horizontalrule" },
      ),
    );
    assert.match(out, /<strong>bold<\/strong><em> italic<\/em><code> code<\/code><s> strike<\/s>/);
    assert.match(out, /<ol start="3"><li>three<\/li><\/ol>/);
    assert.match(out, /<li aria-checked="true" role="checkbox">done<\/li>/);
    assert.match(out, /<blockquote>quoted<\/blockquote>/);
    assert.match(out, /<a href="\/ru\/wow\/raids">link<\/a>/);
    assert.match(out, /<a href="https:\/\/example.com\/" target="_blank" rel="noopener noreferrer">link<\/a>/);
    assert.match(out, /<a href="\/wow\/articles\/mythic-plus">internal<\/a>/);
    assert.match(out, /unpublished target/);
    assert.ok(!out.includes('href=""'));
    assert.match(out, /<img src="https:\/\/cms.example.net\/api\/media\/file\/p.png" alt="Pic" width="10" height="5" loading="lazy" decoding="async"\/><figcaption>Cap<\/figcaption>/);
    assert.match(out, /<hr\/>/);
  });

  it("renders callout and table blocks from structured fields only", () => {
    const out = html(
      doc(
        { type: "block", fields: { blockType: "callout", tone: "warning", title: "Careful <b>", body: "Line 1\nLine 2" } },
        { type: "block", fields: { blockType: "dataTable", caption: "Stats", columns: [{ label: "Spec" }, { label: "DPS" }], rows: [{ cells: [{ value: "Fire" }, { value: "<b>1</b>" }] }] } },
        { type: "block", fields: { blockType: "embed", html: "<iframe>" } },
      ),
    );
    assert.match(out, /<aside class="cms-callout--warning" data-tone="warning"><p>Careful &lt;b&gt;<\/p>/);
    assert.match(out, /<caption>Stats<\/caption><thead><tr><th scope="col">Spec<\/th><th scope="col">DPS<\/th><\/tr><\/thead><tbody><tr><td>Fire<\/td><td>&lt;b&gt;1&lt;\/b&gt;<\/td><\/tr>/);
    assert.ok(!out.includes("<iframe"));
  });

  it("gives headings stable ids that match the table of contents", () => {
    const d = doc(heading("h1", "Start here"), heading("h2", "Start here"), heading("h3", "Детали"), heading("h2", "Q&A: rotation!"));
    const out = html(d);
    assert.match(out, /<h2 id="start-here">Start here<\/h2><h2 id="start-here-1">Start here<\/h2><h3 id="детали">Детали<\/h3><h2 id="qa-rotation">/);
    assert.deepEqual(extractToc(d), [
      { id: "start-here", text: "Start here", level: 2 },
      { id: "start-here-1", text: "Start here", level: 2 },
      { id: "qa-rotation", text: "Q&A: rotation!", level: 2 },
    ]);
    assert.deepEqual(extractToc(d, [2, 3]).map((i) => i.id), ["start-here", "start-here-1", "детали", "qa-rotation"]);
  });

  it("handles empty, malformed and deeply nested input without throwing", () => {
    assert.equal(renderRichText(null, OPTIONS), null);
    assert.equal(renderRichText({} as RichTextDocument, OPTIONS), null);
    let deep: RichTextNode = text("deep");
    for (let i = 0; i < 200; i++) deep = { type: "paragraph", children: [deep] };
    assert.doesNotThrow(() => html(doc(deep)));
    assert.equal(plainText(doc(para(text("one two")), heading("h2", "three"))), "one two\nthree");
    assert.equal(readingMinutes(doc(para(text("word ".repeat(450))))), 2);
  });
});

describe("editor blocks", () => {
  const block = (fields: Record<string, unknown>): RichTextNode => ({ type: "block", fields });
  const withParent = (d: RichTextDocument) =>
    renderToStaticMarkup(renderRichText(d, { ...OPTIONS, embedParent: "gildra.net", blockLabels: { pros: "Плюсы", cons: "Минусы" } }) as never);

  it("embeds only parsed YouTube, Twitch and Rutube ids", () => {
    assert.equal(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(videoEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(videoEmbedUrl("https://www.twitch.tv/videos/123456789", "gildra.net"), "https://player.twitch.tv/?video=123456789&parent=gildra.net&autoplay=false");
    assert.equal(videoEmbedUrl("https://clips.twitch.tv/FunnyClip-abc", "gildra.net"), "https://clips.twitch.tv/embed?clip=FunnyClip-abc&parent=gildra.net&autoplay=false");
    assert.equal(videoEmbedUrl("https://rutube.ru/video/0123456789abcdef0123456789abcdef/"), "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef");
    assert.equal(videoEmbedUrl("https://www.twitch.tv/videos/123456789"), null, "Twitch needs a parent host");
    for (const bad of ["https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://youtube.com/watch?v=short", 7]) {
      assert.equal(videoEmbedUrl(bad), null, String(bad));
    }
  });

  it("renders video as a lazy iframe, unknown links as plain links", () => {
    const out = withParent(doc(block({ blockType: "video", url: "https://youtu.be/dQw4w9WgXcQ", caption: "Разбор" })));
    assert.match(out, /<iframe src="https:\/\/www.youtube-nocookie.com\/embed\/dQw4w9WgXcQ" title="Разбор" loading="lazy"/);
    assert.match(out, /<figcaption>Разбор<\/figcaption>/);
    const fallback = withParent(doc(block({ blockType: "video", url: "https://vimeo.com/1" })));
    assert.doesNotMatch(fallback, /<iframe/);
    assert.match(fallback, /<a href="https:\/\/vimeo.com\/1" rel="noopener noreferrer" target="_blank">/);
    assert.equal(withParent(doc(block({ blockType: "video", url: "javascript:alert(1)" }))), "<div></div>");
  });

  it("renders spoiler, pros/cons, steps and safe buttons", () => {
    const out = withParent(
      doc(
        block({ blockType: "details", summary: "Почему так?", body: "Потому что" }),
        block({ blockType: "prosCons", pros: [{ text: "Быстро" }], cons: [{ text: "Дорого" }, { text: "" }] }),
        block({ blockType: "steps", steps: [{ title: "Шаг", body: "Текст" }, { title: "Второй" }] }),
        block({ blockType: "button", label: "Тир-лист", url: "/tier-lists", style: "secondary" }),
        block({ blockType: "button", label: "Плохо", url: "javascript:alert(1)" }),
      ),
    );
    assert.match(out, /<details><summary>Почему так\?<\/summary><p style="white-space:pre-line">Потому что<\/p><\/details>/);
    assert.match(out, /<div data-kind="pros"><p>Плюсы<\/p><ul><li>Быстро<\/li><\/ul><\/div><div data-kind="cons"><p>Минусы<\/p><ul><li>Дорого<\/li><\/ul><\/div>/);
    assert.match(out, /<ol><li><p>Шаг<\/p><p style="white-space:pre-line">Текст<\/p><\/li><li><p>Второй<\/p><\/li><\/ol>/);
    assert.match(out, /<a href="\/ru\/tier-lists">Тир-лист<\/a>/);
    assert.doesNotMatch(out, /javascript|Плохо/);
  });
});
