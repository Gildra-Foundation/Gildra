import { describe, expect, it } from "vitest";
import { articlesQueryString, articlesSearchParams, hasArticleFilters, normalizeArticlesQuery, resetArticlesQuery } from "../../src/articles/query";

describe("article workbench URLs", () => {
  it("uses the same normalized selection after a URL round trip", () => {
    const query = normalizeArticlesQuery({ q: "  рейд & class?  ", site: "42", locale: "en", status: "draft", page: "3" });
    const url = articlesQueryString(query);
    expect(url).toContain("page=3");
    expect(normalizeArticlesQuery(articlesSearchParams(new URLSearchParams(url)))).toEqual(query);
    expect(query.q).toBe("рейд & class?");
  });

  it("bounds page/search values and omits empty/default URL fields", () => {
    for (const page of ["-1", "0", "1.5", "NaN", "Infinity", ["2", "3"]]) {
      expect(normalizeArticlesQuery({ page }).page).toBe(1);
    }
    expect(normalizeArticlesQuery({ page: "100001" }).page).toBe(100_000);
    expect(normalizeArticlesQuery({ q: "a".repeat(200) }).q).toHaveLength(120);
    expect(articlesQueryString(normalizeArticlesQuery({ locale: "invalid", status: "hidden" }, "en"))).toBe("locale=en");
  });

  it("never broadens a malformed or repeated site filter to all sites", () => {
    for (const site of ["foreign", "42/../../99", ["42", "99"]]) {
      expect(normalizeArticlesQuery({ site }).site).not.toBe("");
    }
    const duplicate = normalizeArticlesQuery(articlesSearchParams(new URLSearchParams("site=42&site=99")));
    expect(duplicate.site).toBe("invalid-site");
    expect(normalizeArticlesQuery({ site: ["42", "99"] })).toEqual(duplicate);
  });

  it("restores independent Back/Forward selections, including content language", () => {
    const history = ["locale=ru&q=raid&site=42&page=2", "locale=en&status=draft", "locale=en&q=paladin&page=4"];
    const restore = (index: number) => normalizeArticlesQuery(articlesSearchParams(new URLSearchParams(history[index])));
    expect(restore(0)).toEqual({ locale: "ru", q: "raid", site: "42", status: "", page: 2 });
    expect(restore(1)).toEqual({ locale: "en", q: "", site: "", status: "draft", page: 1 });
    expect(restore(2).page).toBe(4);
    expect(restore(0).site).toBe("42");
  });

  it("resets narrowing filters and page while retaining content language", () => {
    const query = normalizeArticlesQuery({ q: "raid", site: "2", status: "published", page: "3", locale: "en" });
    expect(hasArticleFilters(query)).toBe(true);
    const reset = resetArticlesQuery(query);
    expect(reset).toEqual({ q: "", site: "", status: "", page: 1, locale: "en" });
    expect(hasArticleFilters(reset)).toBe(false);
    expect(hasArticleFilters({ ...reset, page: 4 })).toBe(false);
  });
});
