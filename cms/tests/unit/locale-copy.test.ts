import { describe, expect, it } from "vitest";
import { emptyLocaleFields } from "../../src/admin/localeCopy";
import { lexical } from "../helpers/payload";

describe("copy text between locales without publishing", () => {
  it("copies empty strings and empty Lexical values, keeping filled fields", () => {
    const source = { title: "Source", summary: "Source summary", content: lexical("Source body"), _status: "published", slug: "shared" };
    const patch = emptyLocaleFields({ title: "Already translated", summary: "   ", content: lexical("") }, source);
    expect(patch).toEqual({ summary: "Source summary", content: source.content });
    expect(patch.content).not.toBe(source.content);
    expect(patch).not.toHaveProperty("_status");
    expect(patch).not.toHaveProperty("slug");
  });
  it("preserves existing body and never fills missing source fields", () => {
    expect(emptyLocaleFields({ title: "Kept", content: lexical("Kept body") }, { title: "Other", content: lexical("Other") })).toEqual({});
    expect(emptyLocaleFields({}, {})).toEqual({});
  });
});
