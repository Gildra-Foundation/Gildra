import fs from "node:fs";
import path from "node:path";

import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Bundle, importBundle, validateBundle } from "../scripts/lib/import-bundle";
import { as, bootPayload, callEndpoint, makeStaff } from "./helpers/payload";

let payload: Payload;
let riftden: number;
let gildra: number;
let bundle: Bundle;

// Produced by `node scripts/cms/export-mdx.mjs --out …` from the four real RiftDen MDX files.
const FIXTURE = path.join(import.meta.dirname, "fixtures/riftden-mdx-bundle.json");

beforeAll(async () => {
  ({ payload } = await bootPayload("importer"));
  const sites = await payload.find({ collection: "sites", overrideAccess: true, depth: 0 });
  riftden = sites.docs.find((s) => s.slug === "riftden")!.id;
  gildra = sites.docs.find((s) => s.slug === "gildra")!.id;
  await makeStaff(payload, { email: "owner@test.local", owner: true });
  await makeStaff(payload, { email: "editor@test.local", sites: [{ site: riftden, role: "editor" }] });
  await makeStaff(payload, { email: "gildra.editor@test.local", sites: [{ site: gildra, role: "editor" }] });
  await makeStaff(payload, { email: "analyst@test.local", sites: [{ site: riftden, role: "analyst" }] });
  bundle = validateBundle(JSON.parse(fs.readFileSync(FIXTURE, "utf8")));
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

const run = (apply: boolean, staffEmail = "editor@test.local", b: Bundle = bundle) => importBundle(payload, b, { site: "riftden", staffEmail, apply });

describe("RiftDen MDX import", () => {
  it("dry run reports and writes nothing", async () => {
    const outcomes = await run(false);
    expect(outcomes.map((o) => [o.slug, o.action])).toEqual([
      ["build-sharing", "create"],
      ["stat-growth", "create"],
    ]);
    expect((await payload.count({ collection: "guides", overrideAccess: true })).totalDocs).toBe(0);
    expect((await payload.count({ collection: "categories", overrideAccess: true })).totalDocs).toBe(0);
  });

  it("creates bilingual drafts on the RiftDen site only, with metadata and links", async () => {
    const outcomes = await run(true);
    expect(outcomes.map((o) => o.action)).toEqual(["created", "created"]);
    const docs = await payload.find({ collection: "guides", draft: true, overrideAccess: true, depth: 0, locale: "all", sort: "slug" });
    expect(docs.docs.map((d) => [d.slug, d.site, d._status])).toEqual([
      ["build-sharing", riftden, "draft"],
      ["stat-growth", riftden, "draft"],
    ]);
    const stat = docs.docs[1] as unknown as Record<string, Record<string, unknown>> & { gameContext: Record<string, unknown> };
    expect(stat.title).toEqual({ en: "Comparing champion stats across levels", ru: expect.any(String) });
    expect(String((stat.title as Record<string, string>).ru).length).toBeGreaterThan(5);
    expect(stat.gameContext).toMatchObject({ lolChampion: "Garen", lolMentionedChampions: ["Garen"] });
    expect(JSON.stringify(stat.content)).toContain("/compare?a=garen&b=darius");
    expect((stat as unknown as { publishedAt: string }).publishedAt).toBe("2026-10-08T00:00:00.000Z");

    const categories = await payload.find({ collection: "categories", overrideAccess: true, locale: "all", depth: 0, sort: "slug" });
    expect(categories.docs.map((c) => [c.slug, c.site])).toEqual([
      ["beginners", riftden],
      ["mechanics", riftden],
    ]);
    const tags = await payload.find({ collection: "tags", overrideAccess: true, depth: 0 });
    expect(tags.docs.map((t) => t.slug)).toEqual(["featured"]);

    // Drafts only: nothing is public until an editor publishes.
    const pub = await callEndpoint(payload, "/public/:site/articles", "get", { params: { site: "riftden" } });
    expect(pub.body.totalDocs).toBe(0);
  });

  it("is idempotent and never touches edited or published records", async () => {
    const stat = (await payload.find({ collection: "guides", where: { slug: { equals: "stat-growth" } }, draft: true, overrideAccess: true, depth: 0 })).docs[0];
    const editor = { ...(await payload.find({ collection: "admins", where: { email: { equals: "editor@test.local" } }, overrideAccess: true })).docs[0], collection: "admins" };
    await payload.update({ collection: "guides", id: stat.id, data: { title: "Edited by hand", _status: "published" } as never, locale: "en", ...as(editor) });
    const before = await payload.findByID({ collection: "guides", id: stat.id, overrideAccess: true, depth: 0 });

    const again = await run(true);
    expect(again.map((o) => [o.slug, o.action])).toEqual([
      ["build-sharing", "skip-exists"],
      ["stat-growth", "skip-exists"],
    ]);
    const after = await payload.findByID({ collection: "guides", id: stat.id, overrideAccess: true, depth: 0 });
    expect(after.title).toBe("Edited by hand");
    expect(after.updatedAt).toBe(before.updatedAt);
    expect((await payload.count({ collection: "guides", overrideAccess: true })).totalDocs).toBe(2);
    expect((await payload.count({ collection: "categories", overrideAccess: true })).totalDocs).toBe(2);
  });

  it("never imports rejected entries and reports why", async () => {
    const rejected: Bundle = {
      ...bundle,
      articles: [{ slug: "with-game-ui", status: "rejected", problems: ["en/with-game-ui.mdx: unsupported component <StatLeaders> (line 3)"], locales: {}, shared: null }],
    };
    const outcomes = await run(true, "editor@test.local", rejected);
    expect(outcomes).toEqual([{ slug: "with-game-ui", action: "skip-rejected", detail: "en/with-game-ui.mdx: unsupported component <StatLeaders> (line 3)" }]);
    expect((await payload.count({ collection: "guides", where: { slug: { equals: "with-game-ui" } }, overrideAccess: true })).totalDocs).toBe(0);
  });

  it("respects staff permissions: other-site editors and analysts cannot import", async () => {
    const fresh: Bundle = { ...bundle, articles: bundle.articles.map((a) => ({ ...a, slug: `${a.slug}-copy` })) };
    await expect(run(true, "gildra.editor@test.local", fresh)).rejects.toThrow();
    await expect(run(true, "analyst@test.local", fresh)).rejects.toThrow();
    expect((await payload.count({ collection: "guides", where: { slug: { like: "-copy" } }, overrideAccess: true })).totalDocs).toBe(0);
    expect(() => validateBundle({ format: "other" })).toThrow();
    expect(() => validateBundle({ ...bundle, articles: [{ ...bundle.articles[0], slug: "../x" }] })).toThrow();
  });
});
