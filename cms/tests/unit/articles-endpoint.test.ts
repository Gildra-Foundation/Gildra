import { describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { articlesData, articlesEndpoint } from "../../src/articles/data";
import { normalizeArticlesQuery } from "../../src/articles/query";

/** Exercise the real endpoint/data path with a Payload find stub, never a database. */
function request(search: string, locale?: "en" | "ru") {
  const find = vi.fn(async ({ collection, page }: { collection: string; page?: number }) => {
    if (collection === "sites") return { docs: [
      { id: 42, name: "First", slug: "first" }, { id: 99, name: "Second", slug: "second" },
    ] };
    return { docs: [], page, totalDocs: 0, totalPages: 0 };
  });
  const req = {
    user: { collection: "admins", id: 1, platformRole: "owner" },
    locale, searchParams: new URLSearchParams(search), payload: { find }, t: () => "Forbidden",
  } as unknown as PayloadRequest;
  return { req, find, guideCalls: () => find.mock.calls.filter(([args]) => args.collection === "guides").map(([args]) => args) };
}

describe("articles endpoint query parity", () => {
  it.each(["site=42&site=99", "site=42&site=42"])("rejects duplicate site filters before querying guides: %s", async (search) => {
    const { req, guideCalls } = request(search, "en");
    await expect(articlesEndpoint.handler(req)).rejects.toMatchObject({ status: 403 });
    expect(guideCalls()).toEqual([]);
  });

  it.each(["en", "ru"] as const)("uses the %s request locale when query locales repeat", async (locale) => {
    const other = locale === "en" ? "ru" : "en";
    const { req, guideCalls } = request(`locale=${other}&locale=${locale}`, locale);
    const response = await articlesEndpoint.handler(req);
    expect(await response.json()).toMatchObject({ locale });
    expect(guideCalls()[0]).toMatchObject({ locale, fallbackLocale: false, overrideAccess: false });
  });

  it("resets repeated page parameters instead of accepting the first value", async () => {
    const { req, guideCalls } = request("page=3&page=4", "en");
    expect(await (await articlesEndpoint.handler(req)).json()).toMatchObject({ page: 1 });
    expect(guideCalls()[0]).toMatchObject({ page: 1 });
  });

  it("retains valid pagination through both endpoint and normalized SSR queries", async () => {
    const api = request("site=42&locale=en&page=3", "ru");
    const ssr = request("", "ru");
    const expected = { locale: "en", page: 3 };
    expect(await (await articlesEndpoint.handler(api.req)).json()).toMatchObject(expected);
    expect(await articlesData(ssr.req, normalizeArticlesQuery({ site: "42", locale: "en", page: "3" }))).toMatchObject(expected);
    expect(api.guideCalls()[0]).toMatchObject({ ...expected, where: { and: [{ site: { in: [42, 99] } }, { site: { equals: "42" } }] } });
    expect(ssr.guideCalls()[0]).toMatchObject(expected);
  });

  it.each([["en", "en"], ["ru", "ru"], [undefined, "ru"]] as const)("matches the SSR locale default for request locale %s", async (requested, expected) => {
    const { req } = request("", requested);
    expect(await (await articlesEndpoint.handler(req)).json()).toMatchObject({ locale: expected });
  });
});
