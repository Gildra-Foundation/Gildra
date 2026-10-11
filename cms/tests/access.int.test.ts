import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedSites } from "../src/seed/sites";
import { as, bootPayload, callEndpoint, lexical, makeStaff, pngFile, reloadStaff } from "./helpers/payload";

let payload: Payload;
let gildra: number;
let riftden: number;
type Staff = Awaited<ReturnType<typeof makeStaff>>;
let owner: Staff, gAdmin: Staff, gEditor: Staff, gAuthor: Staff, gAnalyst: Staff, rEditor: Staff;
let member: Record<string, unknown> & { id: number; collection: "members" };
let gMedia: number, rMedia: number, rCategory: number, gCategory: number;

const content = (text = "Body") => lexical(text);

async function article(site: number, slug: string, extra: Record<string, unknown> = {}, status: "draft" | "published" = "draft") {
  return payload.create({
    collection: "guides",
    data: { site, slug, title: slug, summary: "S", content: content(), _status: status, ...extra } as never,
    overrideAccess: true,
  });
}

beforeAll(async () => {
  ({ payload } = await bootPayload("access"));
  const sites = await payload.find({ collection: "sites", overrideAccess: true, depth: 0 });
  gildra = sites.docs.find((s) => s.slug === "gildra")!.id;
  riftden = sites.docs.find((s) => s.slug === "riftden")!.id;
  await seedSites(payload);
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("staff bootstrap and escalation", () => {
  it("makes the very first account an owner and then closes anonymous creation", async () => {
    const first = await payload.create({
      collection: "admins",
      data: { email: "first@test.local", name: "First", password: "local-test-password-1", platformRole: "staff" } as never,
      overrideAccess: false,
    });
    expect(first.platformRole).toBe("owner");
    await expect(
      payload.create({
        collection: "admins",
        data: { email: "second@test.local", name: "Second", password: "local-test-password-1" } as never,
        overrideAccess: false,
      }),
    ).rejects.toThrow();

    owner = { ...first, collection: "admins" };
    gAdmin = await makeStaff(payload, { email: "gadmin@test.local", sites: [{ site: gildra, role: "admin" }] });
    gEditor = await makeStaff(payload, { email: "geditor@test.local", sites: [{ site: gildra, role: "editor" }] });
    gAuthor = await makeStaff(payload, { email: "gauthor@test.local", name: "Author Name", sites: [{ site: gildra, role: "author" }] });
    gAnalyst = await makeStaff(payload, { email: "ganalyst@test.local", sites: [{ site: gildra, role: "analyst" }] });
    rEditor = await makeStaff(payload, { email: "reditor@test.local", sites: [{ site: riftden, role: "editor" }] });
    const m = await payload.create({
      collection: "members",
      data: { email: "reader@test.local", password: "local-test-password-1", _verified: true, memberships: [{ site: gildra, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    member = { ...(m as never), collection: "members" };
  });

  it("strips role and assignment changes made by non-owners", async () => {
    await payload.update({
      collection: "admins",
      id: gEditor.id,
      data: { platformRole: "owner", sites: [{ site: gildra, role: "admin" }, { site: riftden, role: "admin" }], name: "Renamed" } as never,
      ...as(gEditor),
    });
    const after = await reloadStaff(payload, gEditor.id);
    expect(after.platformRole).toBe("staff");
    expect(after.sites).toHaveLength(1);
    expect(after.sites?.[0]?.role).toBe("editor");
    expect(after.name).toBe("Renamed");
  });

  it("forbids staff provisioning and foreign account edits by site admins", async () => {
    await expect(
      payload.create({ collection: "admins", data: { email: "x@test.local", name: "X", password: "local-test-password-1" } as never, ...as(gAdmin) }),
    ).rejects.toThrow();
    await expect(payload.update({ collection: "admins", id: gEditor.id, data: { name: "Hijack" }, ...as(gAdmin) })).rejects.toThrow();
    await expect(payload.delete({ collection: "admins", id: gEditor.id, ...as(gAdmin) })).rejects.toThrow();
  });

  it("lets owners assign roles, audits it, and protects the last owner", async () => {
    await payload.update({ collection: "admins", id: gAnalyst.id, data: { sites: [{ site: gildra, role: "analyst" }, { site: riftden, role: "analyst" }] } as never, ...as(owner) });
    const audit = await payload.find({ collection: "audit-log", where: { targetId: { equals: String(gAnalyst.id) } }, overrideAccess: true });
    expect(audit.docs.some((d) => d.action === "admins.update" && (d.changes as Record<string, unknown>)?.sites)).toBe(true);
    await payload.update({ collection: "admins", id: gAnalyst.id, data: { sites: [{ site: gildra, role: "analyst" }] } as never, ...as(owner) });
    gAnalyst = await reloadStaff(payload, gAnalyst.id);

    await expect(payload.update({ collection: "admins", id: owner.id, data: { platformRole: "staff" } as never, ...as(owner) })).rejects.toThrow(/last platform owner/);
    await expect(payload.delete({ collection: "admins", id: owner.id, ...as(owner) })).rejects.toThrow(/last platform owner/);
  });

  it("hides staff accounts from members and anonymous users", async () => {
    await expect(payload.find({ collection: "admins", overrideAccess: false })).rejects.toThrow();
    await expect(payload.find({ collection: "admins", ...as(member) })).rejects.toThrow();
    const self = await payload.find({ collection: "admins", ...as(gAuthor) });
    expect(self.docs.map((d) => d.id)).toEqual([gAuthor.id]);
  });
});

describe("media", () => {
  it("accepts raster images for the editor's own site only and rejects SVG", async () => {
    const created = await payload.create({ collection: "media", data: { site: gildra, alt: "Pixel" } as never, file: pngFile("g.png"), ...as(gEditor) });
    gMedia = created.id;
    rMedia = (await payload.create({ collection: "media", data: { site: riftden, alt: "Pixel" } as never, file: pngFile("r.png"), overrideAccess: true })).id;
    await expect(
      payload.create({ collection: "media", data: { site: riftden, alt: "x" } as never, file: pngFile("spoof.png"), ...as(gEditor) }),
    ).rejects.toThrow();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(
      payload.create({
        collection: "media",
        data: { site: gildra, alt: "svg" } as never,
        file: { data: svg, mimetype: "image/svg+xml", name: "x.svg", size: svg.length },
        ...as(gEditor),
      }),
    ).rejects.toThrow();
  });
});

describe("tenant isolation of editorial content", () => {
  let gDraft: number, rDraft: number;

  it("keeps reads inside the editor's site", async () => {
    gDraft = (await article(gildra, "g-draft")).id;
    rDraft = (await article(riftden, "r-draft")).id;
    const seen = await payload.find({ collection: "guides", draft: true, ...as(gEditor) });
    expect(seen.docs.map((d) => d.id)).toContain(gDraft);
    expect(seen.docs.map((d) => d.id)).not.toContain(rDraft);
    await expect(payload.findByID({ collection: "guides", id: rDraft, draft: true, ...as(gEditor) })).rejects.toThrow();
    const versions = await payload.findVersions({ collection: "guides", depth: 0, ...as(gEditor) });
    expect(versions.docs.every((v) => (v.version as { site?: unknown }).site === gildra)).toBe(true);
  });

  it("rejects spoofed site on create, including draft and autosave paths", async () => {
    const data = { site: riftden, slug: "spoof", title: "x", summary: "x", content: content() } as never;
    await expect(payload.create({ collection: "guides", data, ...as(gEditor) })).rejects.toThrow();
    await expect(payload.create({ collection: "guides", data, draft: true, ...as(gEditor) })).rejects.toThrow();
    const count = await payload.count({ collection: "guides", where: { slug: { equals: "spoof" } }, overrideAccess: true });
    expect(count.totalDocs).toBe(0);
  });

  it("rejects moving a document to another site, even for owners and drafts", async () => {
    await expect(payload.update({ collection: "guides", id: gDraft, data: { site: riftden } as never, draft: true, ...as(gEditor) })).rejects.toThrow();
    await expect(payload.update({ collection: "guides", id: gDraft, data: { site: riftden } as never, ...as(owner) })).rejects.toThrow();
    await expect(
      payload.update({ collection: "guides", id: gDraft, data: { title: "autosave" }, draft: true, autosave: true, ...as(rEditor) }),
    ).rejects.toThrow();
  });

  it("rejects cross-site relationships in fields and rich text, in drafts too", async () => {
    gCategory = (await payload.create({ collection: "categories", data: { site: gildra, slug: "raid", title: "Raid" } as never, ...as(gEditor) })).id;
    rCategory = (await payload.create({ collection: "categories", data: { site: riftden, slug: "raid", title: "Raid" } as never, ...as(rEditor) })).id;

    const attempts: Record<string, unknown>[] = [
      { hero: rMedia },
      { categories: [rCategory] },
      { seo: { image: rMedia } },
      { author: rEditor.id },
      { content: lexical("x", [{ type: "upload", version: 3, relationTo: "media", value: rMedia, fields: null, format: "" }]) },
      { content: lexical("x", [{ type: "relationship", version: 2, relationTo: "members", value: member.id, format: "" }]) },
    ];
    for (const extra of attempts) {
      await expect(payload.update({ collection: "guides", id: gDraft, data: extra as never, draft: true, ...as(gEditor) })).rejects.toThrow();
    }
    // A non-owner staff member with a write role on the site is a valid author.
    const authored = await payload.update({ collection: "guides", id: gDraft, data: { author: gAuthor.id } as never, draft: true, depth: 0, ...as(gEditor) });
    expect(authored.author).toBe(gAuthor.id);
    // …but analysts are not authors.
    await expect(payload.update({ collection: "guides", id: gDraft, data: { author: gAnalyst.id } as never, draft: true, ...as(gEditor) })).rejects.toThrow();

    const ok = await payload.update({
      collection: "guides",
      id: gDraft,
      data: { hero: gMedia, categories: [gCategory], content: lexical("ok", [{ type: "upload", version: 3, relationTo: "media", value: gMedia, fields: null, format: "" }]) } as never,
      draft: true,
      ...as(gEditor),
    });
    expect(ok.id).toBe(gDraft);
  });

  it("allows the same slug on different sites but not twice on one site", async () => {
    await article(gildra, "same-slug");
    await article(riftden, "same-slug");
    await expect(article(gildra, "same-slug")).rejects.toThrow();
    await expect(
      payload.create({ collection: "categories", data: { site: gildra, slug: "raid", title: "Dup" } as never, overrideAccess: true }),
    ).rejects.toThrow();
  });
});

describe("publication rights", () => {
  let own: number;
  let published: number;

  it("records authors as themselves and lets them save drafts", async () => {
    const doc = await payload.create({
      collection: "guides",
      data: { site: gildra, slug: "author-draft", title: "A", summary: "S", content: content(), author: gEditor.id } as never,
      draft: true,
      depth: 0,
      ...as(gAuthor),
    });
    own = doc.id;
    expect(doc.author).toBe(gAuthor.id);
    const updated = await payload.update({ collection: "guides", id: own, data: { title: "A2" }, draft: true, autosave: true, ...as(gAuthor) });
    expect(updated.title).toBe("A2");
  });

  it("forbids authors to publish, unpublish, restore live versions or edit others' work", async () => {
    await expect(
      payload.create({ collection: "guides", data: { site: gildra, slug: "author-live", title: "x", summary: "x", content: content(), _status: "published" } as never, ...as(gAuthor) }),
    ).rejects.toThrow();
    await expect(payload.update({ collection: "guides", id: own, data: { _status: "published" } as never, ...as(gAuthor) })).rejects.toThrow();
    await expect(payload.update({ collection: "guides", id: own, data: { _status: "published" } as never, draft: true, ...as(gAuthor) })).rejects.toThrow();

    published = (await payload.update({ collection: "guides", id: own, data: { _status: "published" } as never, ...as(gEditor) })).id;
    await expect(payload.update({ collection: "guides", id: published, data: { _status: "draft" } as never, ...as(gAuthor) })).rejects.toThrow();
    await expect(payload.update({ collection: "guides", id: published, data: { title: "live edit" }, ...as(gAuthor) })).rejects.toThrow();
    // A new draft over the published document is fine and leaves the live version alone.
    await payload.update({ collection: "guides", id: published, data: { title: "draft over live" }, draft: true, ...as(gAuthor) });

    // Live row is published while the latest version is a draft: still no live edits.
    await expect(payload.update({ collection: "guides", id: published, data: { title: "sneaky live edit" }, ...as(gAuthor) })).rejects.toThrow();
    const versions = await payload.findVersions({ collection: "guides", where: { parent: { equals: published } }, sort: "createdAt", overrideAccess: true });
    await expect(payload.restoreVersion({ collection: "guides", id: versions.docs[0].id, ...as(gAuthor) })).rejects.toThrow();

    const editorDoc = await article(gildra, "editor-doc", { author: gEditor.id });
    await expect(payload.update({ collection: "guides", id: editorDoc.id, data: { title: "x" }, draft: true, ...as(gAuthor) })).rejects.toThrow();
    await expect(payload.delete({ collection: "guides", id: own, ...as(gAuthor) })).rejects.toThrow();
  });

  it("keeps serving the published version while a newer draft exists", async () => {
    const anon = await payload.findByID({ collection: "guides", id: published, overrideAccess: false });
    expect(anon.title).toBe("A2");
    const latest = await payload.findByID({ collection: "guides", id: published, draft: true, ...as(gEditor) });
    expect(latest.title).toBe("draft over live");
    const api = await callEndpoint(payload, "/public/:site/articles/:slug", "get", { params: { site: "gildra", slug: "author-draft" } });
    expect(api.status).toBe(200);
    expect(api.body.title).toBe("A2");
    expect(api.body.author).toEqual({ name: "Author Name" });
    expect(api.raw).not.toMatch(/@test\.local/);
    expect(api.raw).not.toMatch(/draft over live/);
  });

  it("refuses scheduled publishing for authors and accepts it for editors", async () => {
    const input = (user: number) => ({ type: "publish", doc: { relationTo: "guides", value: String(own) }, user: { relationTo: "admins", value: user } });
    await expect(payload.jobs.queue({ task: "schedulePublish", input: input(gAuthor.id) as never, waitUntil: new Date(Date.now() + 3600_000) })).rejects.toThrow();
    const job = await payload.jobs.queue({ task: "schedulePublish", input: input(gEditor.id) as never, waitUntil: new Date(Date.now() + 3600_000) });
    expect((job as { site?: unknown }).site).toBe(gildra);
    const listed = await payload.find({ collection: "payload-jobs", ...as(gEditor) });
    expect(listed.docs.map((d) => d.id)).toContain(job.id);
    await expect(payload.find({ collection: "payload-jobs", ...as(rEditor) })).resolves.toMatchObject({ totalDocs: 0 });
    await expect(payload.find({ collection: "payload-jobs", ...as(member) })).rejects.toThrow();
  });
});

describe("readers versus staff and anonymous access", () => {
  it("gives readers published content only and no editorial operations", async () => {
    const docs = await payload.find({ collection: "guides", ...as(member), limit: 100 });
    expect(docs.docs.every((d) => d._status === "published")).toBe(true);
    await expect(payload.create({ collection: "guides", data: { site: gildra, slug: "m", title: "m", summary: "m", content: content() } as never, draft: true, ...as(member) })).rejects.toThrow();
    const any = docs.docs[0];
    await expect(payload.update({ collection: "guides", id: any.id, data: { title: "x" }, draft: true, ...as(member) })).rejects.toThrow();
    await expect(payload.create({ collection: "media", data: { site: gildra, alt: "m" } as never, file: pngFile("m.png"), ...as(member) })).rejects.toThrow();
    await expect(payload.update({ collection: "site-settings", where: { site: { equals: gildra } }, data: { siteTitle: "pwned" }, ...as(member) })).rejects.toThrow();
  });

  it("keeps internal collections closed to readers", async () => {
    for (const collection of ["audit-log", "payload-locked-documents", "payload-migrations", "sites"] as const) {
      await expect(payload.find({ collection: collection as never, ...as(member) })).rejects.toThrow();
    }
    await expect(
      payload.create({ collection: "payload-locked-documents", data: { document: { relationTo: "guides", value: 1 }, globalSlug: null } as never, ...as(member) }),
    ).rejects.toThrow();
  });

  it("exposes no private data anonymously", async () => {
    for (const collection of ["admins", "members", "audit-log", "sites", "payload-jobs"] as const) {
      await expect(payload.find({ collection: collection as never, overrideAccess: false })).rejects.toThrow();
    }
    const guides = await payload.find({ collection: "guides", overrideAccess: false, limit: 100 });
    expect(guides.docs.every((d) => d._status === "published")).toBe(true);
    const settings = await callEndpoint(payload, "/public/:site/settings", "get", { params: { site: "riftden" } });
    expect(settings.status).toBe(200);
    expect(settings.body.siteTitle).toBe("Riftden");
    expect(settings.raw).not.toMatch(/revalidate|plausible|registration/i);
  });

  it("restricts site settings to site admins", async () => {
    await expect(payload.update({ collection: "site-settings", where: { site: { equals: gildra } }, data: { tagline: "x" }, ...as(gEditor) })).rejects.toThrow();
    const ok = await payload.update({ collection: "site-settings", where: { site: { equals: gildra } }, data: { tagline: "Guides" }, ...as(gAdmin) });
    expect(ok.docs).toHaveLength(1);
    await expect(
      payload.create({ collection: "site-settings", data: { site: gildra, siteTitle: "dup" } as never, overrideAccess: true }),
    ).rejects.toThrow();
  });
});

describe("preview", () => {
  it("serves the latest draft for a valid token and refuses tampered, foreign or revoked access", async () => {
    const { signPreview } = await import("../src/preview/token");
    const doc = await article(gildra, "preview-doc");
    await payload.update({ collection: "guides", id: doc.id, data: { title: "Preview draft" }, draft: true, overrideAccess: true });
    const token = signPreview({ c: "guides", id: String(doc.id), site: String(gildra), uid: String(gEditor.id) });
    const ok = await callEndpoint(payload, "/preview-content", "get", { query: { token } });
    expect(ok.status).toBe(200);
    expect(ok.body.doc.title).toBe("Preview draft");

    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect((await callEndpoint(payload, "/preview-content", "get", { query: { token: tampered } })).status).toBe(401);
    const expired = signPreview({ c: "guides", id: String(doc.id), site: String(gildra), uid: String(gEditor.id) }, Date.now() - 3600_000);
    expect((await callEndpoint(payload, "/preview-content", "get", { query: { token: expired } })).status).toBe(401);
    const foreign = signPreview({ c: "guides", id: String(doc.id), site: String(gildra), uid: String(rEditor.id) });
    expect((await callEndpoint(payload, "/preview-content", "get", { query: { token: foreign } })).status).toBe(403);
    const wrongSite = signPreview({ c: "guides", id: String(doc.id), site: String(riftden), uid: String(owner.id) });
    expect((await callEndpoint(payload, "/preview-content", "get", { query: { token: wrongSite } })).status).toBe(404);
  });
});

describe("site configuration authority", () => {
  it("keeps upstream/link/webhook mappings owner-only while site admins manage presentation and registration", async () => {
    const before = await payload.findByID({ collection: "sites", id: gildra, overrideAccess: true });
    await payload.update({
      collection: "sites",
      id: gildra,
      data: {
        plausibleSiteId: "riftden.com",
        publicUrl: "https://evil.example",
        revalidateUrl: "https://evil.example/hook",
        domain: "evil.example",
        slug: "evil",
        name: "Gildra Network",
        registrationEnabled: true,
        languages: ["en"],
      } as never,
      ...as(gAdmin),
    });
    const after = await payload.findByID({ collection: "sites", id: gildra, overrideAccess: true });
    expect(after).toMatchObject({
      plausibleSiteId: before.plausibleSiteId,
      publicUrl: before.publicUrl,
      revalidateUrl: before.revalidateUrl ?? null,
      domain: before.domain,
      slug: before.slug,
      name: "Gildra Network",
      registrationEnabled: true,
      languages: ["en"],
    });
    // Foreign sites stay untouchable for a site admin.
    await expect(payload.update({ collection: "sites", id: riftden, data: { name: "x" }, ...as(gAdmin) })).rejects.toThrow();

    // The analytics endpoint still queries Gildra's own Plausible site.
    process.env.PLAUSIBLE_URL = "http://plausible.invalid";
    process.env.PLAUSIBLE_API_KEY = "test-key";
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { dimensions?: string[] };
      return Response.json({ results: body.dimensions?.length ? [] : [{ dimensions: [], metrics: [0, 0, 0, 0] }] });
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await callEndpoint(payload, "/analytics/report", "get", { user: gAdmin, query: { site: String(gildra), period: "28d" } });
      expect(res.body.status).toBe("ok");
      const sent = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).site_id);
      expect(new Set(sent)).toEqual(new Set([before.plausibleSiteId]));
    } finally {
      vi.unstubAllGlobals();
      delete process.env.PLAUSIBLE_URL;
      delete process.env.PLAUSIBLE_API_KEY;
    }

    // Owners can change mappings; restore everything.
    await payload.update({ collection: "sites", id: gildra, data: { revalidateUrl: "https://gildra.net/api/cms/revalidate" }, ...as(owner) });
    expect((await payload.findByID({ collection: "sites", id: gildra, overrideAccess: true })).revalidateUrl).toBe("https://gildra.net/api/cms/revalidate");
    await payload.update({
      collection: "sites",
      id: gildra,
      data: { revalidateUrl: null, name: before.name, registrationEnabled: before.registrationEnabled, languages: before.languages } as never,
      ...as(owner),
    });
  });
});

describe("public translation contract", () => {
  it("reports only translations that exist in the published version", async () => {
    // EN-only article, published; a RU draft added later must not count.
    const enOnly = await payload.create({
      collection: "guides",
      data: { site: gildra, slug: "en-only", title: "English title", summary: "English summary", content: lexical("English body"), _status: "published" } as never,
      locale: "en",
      ...as(gEditor),
    });
    await payload.update({
      collection: "guides",
      id: enOnly.id,
      data: { title: "Черновик", summary: "Черновик", content: lexical("Черновик") } as never,
      locale: "ru",
      draft: true,
      ...as(gEditor),
    });
    const ruRequest = await callEndpoint(payload, "/public/:site/articles/:slug", "get", { params: { site: "gildra", slug: "en-only" }, query: { locale: "ru" } });
    expect(ruRequest.body).toMatchObject({ requestedLocale: "ru", resolvedLocale: "en", availableLocales: ["en"], title: "English title", summary: "English summary" });
    expect(ruRequest.raw).not.toContain("Черновик");

    // Genuine RU/EN article.
    const both = await payload.create({
      collection: "guides",
      data: { site: gildra, slug: "both-languages", title: "Title", summary: "Summary", content: lexical("Body"), _status: "published" } as never,
      locale: "en",
      ...as(gEditor),
    });
    await payload.update({
      collection: "guides",
      id: both.id,
      data: { title: "Заголовок", summary: "Описание", content: lexical("Текст"), _status: "published" } as never,
      locale: "ru",
      ...as(gEditor),
    });
    const ru = await callEndpoint(payload, "/public/:site/articles/:slug", "get", { params: { site: "gildra", slug: "both-languages" }, query: { locale: "ru" } });
    expect(ru.body).toMatchObject({ requestedLocale: "ru", resolvedLocale: "ru", availableLocales: ["en", "ru"], title: "Заголовок", summary: "Описание" });
    const en = await callEndpoint(payload, "/public/:site/articles/:slug", "get", { params: { site: "gildra", slug: "both-languages" }, query: { locale: "en" } });
    expect(en.body).toMatchObject({ resolvedLocale: "en", availableLocales: ["en", "ru"], title: "Title" });

    // Lists carry the same contract per article.
    const list = await callEndpoint(payload, "/public/:site/articles", "get", { params: { site: "gildra" }, query: { locale: "ru", limit: "50" } });
    const bySlug = Object.fromEntries((list.body.docs as { slug: string }[]).map((d) => [d.slug, d]));
    expect(bySlug["en-only"]).toMatchObject({ resolvedLocale: "en", availableLocales: ["en"], title: "English title" });
    expect(bySlug["both-languages"]).toMatchObject({ resolvedLocale: "ru", availableLocales: ["en", "ru"], title: "Заголовок" });
    // Lists carry a computed reading time but never the article body.
    for (const doc of list.body.docs as Record<string, unknown>[]) {
      expect(doc.readingTime).toBeGreaterThanOrEqual(1);
      expect(doc).not.toHaveProperty("content");
    }
    expect(ru.body.readingTime).toBe(1);

    // A partial translation (RU title only, published) is not a translation.
    const partialDoc = await payload.create({
      collection: "guides",
      data: { site: gildra, slug: "partial-ru", title: "English title", summary: "English summary", content: lexical("English body"), _status: "published" } as never,
      locale: "en",
      ...as(gEditor),
    });
    // Payload refuses to publish an incomplete RU locale directly…
    await expect(
      payload.update({ collection: "guides", id: partialDoc.id, data: { title: "Только заголовок", _status: "published" } as never, locale: "ru", ...as(gEditor) }),
    ).rejects.toThrow();
    // …but a RU-title draft followed by an EN publish carries the partial RU title into the live version.
    await payload.update({ collection: "guides", id: partialDoc.id, data: { title: "Только заголовок" }, locale: "ru", draft: true, ...as(gEditor) });
    await payload.update({ collection: "guides", id: partialDoc.id, data: { summary: "English summary 2", _status: "published" } as never, locale: "en", ...as(gEditor) });
    const live = await payload.findByID({ collection: "guides", id: partialDoc.id, locale: "ru", fallbackLocale: false, overrideAccess: true });
    expect(live.title).toBe("Только заголовок");
    const partial = await callEndpoint(payload, "/public/:site/articles/:slug", "get", { params: { site: "gildra", slug: "partial-ru" }, query: { locale: "ru" } });
    expect(partial.body).toMatchObject({ resolvedLocale: "en", availableLocales: ["en"], title: "English title", summary: "English summary 2" });
  });
});

describe("analytics endpoint authorization", () => {
  it("checks the site role before any upstream call", async () => {
    process.env.PLAUSIBLE_URL = "http://plausible.invalid";
    process.env.PLAUSIBLE_API_KEY = "test-key";
    // Real v2 shape: one aggregate row, no rows for empty breakdowns.
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { dimensions?: string[] };
      return Response.json({ results: body.dimensions?.length ? [] : [{ metrics: [1, 2, 3, 4], dimensions: [] }] });
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const forbidden = [
        await callEndpoint(payload, "/analytics/report", "get", { user: gAuthor, query: { site: String(gildra) } }),
        await callEndpoint(payload, "/analytics/report", "get", { user: gAnalyst, query: { site: String(riftden) } }),
        await callEndpoint(payload, "/analytics/report", "get", { user: member, query: { site: String(gildra) } }),
        await callEndpoint(payload, "/analytics/report", "get", { query: { site: String(gildra) } }),
      ];
      expect(forbidden.map((r) => r.status)).toEqual([403, 403, 403, 403]);
      expect(fetchSpy).not.toHaveBeenCalled();

      const bad = await callEndpoint(payload, "/analytics/report", "get", { user: gAnalyst, query: { site: String(gildra), period: "forever" } });
      expect(bad.status).toBe(400);

      const ok = await callEndpoint(payload, "/analytics/report", "get", { user: gAnalyst, query: { site: String(gildra), period: "7d" } });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe("ok");
      expect(fetchSpy).toHaveBeenCalled();
      expect(ok.raw).not.toContain("test-key");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.PLAUSIBLE_URL;
      delete process.env.PLAUSIBLE_API_KEY;
    }
  });
});

describe("seed", () => {
  it("is idempotent and never touches accounts", async () => {
    const before = await payload.find({ collection: "admins", overrideAccess: true, depth: 0, pagination: false, sort: "id" });
    const report = await seedSites(payload);
    expect(report).toEqual({ createdSites: [], createdSettings: [] });
    await seedSites(payload);
    expect((await payload.count({ collection: "sites", overrideAccess: true })).totalDocs).toBe(2);
    expect((await payload.count({ collection: "site-settings", overrideAccess: true })).totalDocs).toBe(2);
    const after = await payload.find({ collection: "admins", overrideAccess: true, depth: 0, pagination: false, sort: "id" });
    expect(after.docs.map((d) => [d.id, d.updatedAt])).toEqual(before.docs.map((d) => [d.id, d.updatedAt]));
  });
});
