import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SKIP_REVALIDATION } from "../src/editorial/policy";
import { as, bootPayload, lexical, makeStaff } from "./helpers/payload";

let payload: Payload;
let site: number;
let editor: Awaited<ReturnType<typeof makeStaff>>;

beforeAll(async () => {
  ({ payload } = await bootPayload("titlesearch"));
  site = (await payload.find({ collection: "sites", where: { slug: { equals: "gildra" } }, overrideAccess: true })).docs[0].id;
  editor = await makeStaff(payload, { email: "editor@titlesearch.test", sites: [{ site, role: "editor" }] });
  const doc = await payload.create({ collection: "guides", ...as(editor), locale: "en", context: { [SKIP_REVALIDATION]: true },
    data: { site, slug: "fury", title: "Fury Warrior", summary: "S", content: lexical("Body"), _status: "published" } });
  await payload.update({ collection: "guides", id: doc.id, ...as(editor), locale: "ru", context: { [SKIP_REVALIDATION]: true },
    data: { title: "Воин ярости", summary: "С", content: lexical("Текст") } });
});
afterAll(async () => { await payload?.db.destroy?.(); });

describe("title search across content languages", () => {
  it.each(["en", "ru"] as const)("finds the Russian title while %s is selected", async (locale) => {
    const found = await payload.find({ collection: "guides", ...as(editor), locale, where: { or: [{ title: { like: "воин" } }, { slug: { like: "воин" } }] } });
    expect(found.docs.map((d) => d.slug)).toEqual(["fury"]);
  });

  it("finds the English title while Russian is selected", async () => {
    const found = await payload.find({ collection: "guides", ...as(editor), locale: "ru", where: { title: { like: "fury" } } });
    expect(found.totalDocs).toBe(1);
  });

  it("keeps non-matching searches empty", async () => {
    const found = await payload.find({ collection: "guides", ...as(editor), locale: "en", where: { title: { like: "mage" } } });
    expect(found.totalDocs).toBe(0);
  });
});
