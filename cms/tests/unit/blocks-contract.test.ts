import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BLOCKS, CMS_PAGES, pageUrls } from "../../src/blocks/contract";
import { checkBlocks, formatIssue } from "../../src/blocks/validate";

const web = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../../apps/web/contracts/blocks.schema.json"), "utf8"));

describe("shared block contract", () => {
  it("is the generated copy of the web contract", () => {
    expect(BLOCKS).toEqual(web.blocks);
  });

  it("lists only static pages whose blocks exist", () => {
    for (const page of CMS_PAGES) for (const type of page.blocks) expect(BLOCKS[type], `${page.id}: ${type}`).toBeDefined();
    expect(CMS_PAGES.find((p) => p.id === "wow/privacy")?.blocks).toEqual(["legal"]);
  });

  it("builds public URLs per site", () => {
    expect(pageUrls({ site: "gildra", game: "wow", path: "/privacy" })).toEqual({ en: "/privacy", ru: "/ru/privacy" });
    expect(pageUrls({ site: "gildra", game: "league-of-legends", path: "/" })).toEqual({ en: "/league-of-legends", ru: "/ru/league-of-legends" });
    expect(pageUrls({ site: "riftden", game: "league-of-legends", path: "/" })).toEqual({ en: "/en", ru: "/" });
  });
});

describe("checkBlocks", () => {
  it("accepts empty values and valid configs", () => {
    expect(checkBlocks(null, ["legal"])).toEqual([]);
    expect(checkBlocks([], ["legal"])).toEqual([]);
    expect(checkBlocks([{ type: "columns", props: { layout: "even", id: "anything" }, children: [{ type: "adSlot" }] }], null)).toEqual([]);
  });

  it("explains each problem", () => {
    const issues = checkBlocks([{ type: "legal", props: { title: 1, sections: [] } }, { type: "x" }, 5], ["legal"]);
    expect(issues.map((i) => formatIssue(i, "en"))).toEqual([
      'Block 1 "legal" (Legal text), field updated: required field is missing (string).',
      'Block 1 "legal" (Legal text), field backLabel: required field is missing (string).',
      'Block 1 "legal" (Legal text), field title: expected string.',
      'Block 2 "x": unknown block type. Allowed on this page: legal.',
      "Block 3: a block must be an object { type, props }.",
    ]);
    expect(formatIssue(checkBlocks({}, null)[0], "ru")).toBe("Блоки: ожидается список блоков (JSON-массив).");
  });

  it("limits nesting like the site (6 levels)", () => {
    let deep: unknown = [{ type: "adSlot" }];
    for (let i = 0; i < 7; i++) deep = [{ type: "container", children: deep }];
    expect(checkBlocks(deep, null).map((i) => i.code)).toEqual(["too-deep"]);
  });
});
