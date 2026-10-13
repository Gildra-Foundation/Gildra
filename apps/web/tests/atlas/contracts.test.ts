import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { matchesSchema } from "../../lib/blocks/contracts.ts";

const contracts = JSON.parse(readFileSync(new URL("../../contracts/blocks.schema.json", import.meta.url), "utf8")) as { blocks: Record<string, { container: boolean; props: Parameters<typeof matchesSchema>[1] }> };

describe("block contracts", () => {
  it("cover the shared, WoW and League blocks", () => {
    for (const type of ["container", "columns", "legal", "wow.specBody", "lol.hero"]) assert.ok(type in contracts.blocks, type);
    assert.equal(contracts.blocks.columns.container, true);
    assert.equal(contracts.blocks["wow.specBody"].container, false);
  });
  it("accept valid props and reject typos, wrong types and unknown fields", () => {
    const spec = contracts.blocks["wow.specBody"].props;
    assert.ok(matchesSchema({ slug: "fury-warrior" }, spec));
    assert.ok(!matchesSchema({}, spec), "required slug");
    assert.ok(!matchesSchema({ slug: 7 }, spec), "string slug");
    assert.ok(!matchesSchema({ slug: "fury-warrior", colour: "red" }, spec), "no unknown props");
    const slot = contracts.blocks.adSlot.props;
    assert.ok(matchesSchema({ variant: "rect" }, slot));
    assert.ok(!matchesSchema({ variant: "banner" }, slot), "enum");
  });
});
