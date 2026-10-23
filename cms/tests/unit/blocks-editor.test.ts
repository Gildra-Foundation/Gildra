import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { BLOCKS } from "../../src/blocks/contract";
import { checkBlocks } from "../../src/blocks/validate";
import { controlFor, issuesByBlock, issuesWithin, moveItem, newBlock, setProp } from "../../src/fields/blocksEditor/model";
import { sitePreviewTarget } from "../../src/preview/sitePreview";

describe("blocks editor model", () => {
  it("starts every block valid, so adding one never breaks a save", () => {
    for (const type of Object.keys(BLOCKS)) expect(checkBlocks([newBlock(type)], null), type).toEqual([]);
    expect(newBlock("legal")).toEqual({ type: "legal", props: { title: "", updated: "", sections: [], backLabel: "" } });
    expect(newBlock("container")).toEqual({ type: "container", children: [] });
    expect(newBlock("wow.tierWorkspace")).toEqual({ type: "wow.tierWorkspace" });
  });

  it("maps contract properties to controls", () => {
    const legal = BLOCKS.legal.props.properties!;
    expect(controlFor("title", legal.title)).toEqual({ kind: "text", multiline: false });
    expect(controlFor("sections", legal.sections).kind).toBe("list");
    expect(controlFor("text", legal.sections.items!.properties!.text)).toEqual({ kind: "text", multiline: true });
    expect(controlFor("linkToHome", BLOCKS.sectionNav.props.properties!.linkToHome)).toEqual({ kind: "boolean" });
    expect(controlFor("layout", BLOCKS.columns.props.properties!.layout)).toEqual({ kind: "choice", options: ["meta", "even"], free: false });
    // `id` accepts known anchors or any value.
    expect(controlFor("id", BLOCKS.columns.props.properties!.id)).toMatchObject({ kind: "choice", free: true });
  });

  it("drops empty optional props instead of storing empty strings", () => {
    expect(setProp({ variant: "route" }, "className", "", false)).toEqual({ variant: "route" });
    expect(setProp({ className: "x" }, "className", "", false)).toBeUndefined();
    expect(setProp({}, "title", "", true)).toEqual({ title: "" });
  });

  it("groups issues by block position, nested ones included", () => {
    const map = issuesByBlock([{ type: "container", children: [{ type: "legal" }] }, { type: "x" }], null);
    expect([...map.keys()]).toEqual(["1.1", "2"]);
    expect(issuesWithin(map, "1")).toHaveLength(4);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});

describe("page previews on the site", () => {
  const env = process.env.CMS_SITE_PREVIEW;
  beforeAll(() => {
    process.env.PAYLOAD_SECRET ||= "local-test-secret-only";
  });
  afterEach(() => {
    process.env.CMS_SITE_PREVIEW = env;
  });
  const req = (slug: string) =>
    ({ user: { collection: "admins", id: 3 }, payload: { findByID: async () => ({ slug, publicUrl: `https://${slug}.example` }) } }) as never;

  it("open Gildra's /cms-preview for pages, but not Riftden's article-only preview", async () => {
    process.env.CMS_SITE_PREVIEW = "gildra,riftden";
    const gildra = await sitePreviewTarget({ collection: "pages", doc: { id: 1, site: 101 }, locale: "ru", req: req("gildra") });
    expect(gildra).toMatch(/^https:\/\/gildra\.example\/ru\/cms-preview\?token=/);
    expect(await sitePreviewTarget({ collection: "pages", doc: { id: 1, site: 102 }, locale: "ru", req: req("riftden") })).toBeNull();
    expect(await sitePreviewTarget({ collection: "guides", doc: { id: 1, site: 102 }, locale: "ru", req: req("riftden") })).toMatch(/riftden\.example\/preview/);
  });
});
