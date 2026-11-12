import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchCursor, searchListParams } from "../../components/platform/search/searchList.ts";

describe("site search: show more", () => {
  it("carries the page's query and the cursor, and leaves the default kind out", () => {
    assert.equal(searchListParams({ q: "Огненный шар", kind: "all" }, "abc_-=1").toString(), "q=%D0%9E%D0%B3%D0%BD%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9+%D1%88%D0%B0%D1%80&cursor=abc_-%3D1");
    assert.equal(searchListParams({ q: "topaz", kind: "items", game: "wow" }, "c1").toString(), "q=topaz&type=items&game=wow&cursor=c1");
  });

  it("takes a cursor from the address bar only when it looks like one", () => {
    assert.equal(searchCursor("eyJpZCI6IjEyMyJ9"), "eyJpZCI6IjEyMyJ9");
    for (const bad of ["", "a b", "../x", "a/b", "x".repeat(129), ["a", "b"], null, undefined]) assert.equal(searchCursor(bad), "", `rejected: ${JSON.stringify(bad)}`);
  });
});
