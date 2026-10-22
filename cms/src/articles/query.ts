import { pageNumber, searchText } from "../components/workspace/query";

export type ArticlesQuery = {
  q: string;
  site: string;
  status: "" | "draft" | "published";
  locale: "en" | "ru";
  page: number;
};

/** The same normalized query drives the server render, API and browser history. */
export function normalizeArticlesQuery(params: Record<string, unknown>, defaultLocale: "en" | "ru" = "ru"): ArticlesQuery {
  return {
    q: searchText(params.q),
    // Do not turn an invalid or repeated tenant filter into access to all sites.
    // articlesData validates this identifier and applies the viewer's permissions.
    site: typeof params.site === "string" ? params.site.slice(0, 120) : params.site == null ? "" : "invalid-site",
    status: params.status === "draft" || params.status === "published" ? params.status : "",
    locale: params.locale === "en" || params.locale === "ru" ? params.locale : defaultLocale,
    page: pageNumber(typeof params.page === "string" || typeof params.page === "number" ? String(params.page) : ""),
  };
}

/** URLSearchParams duplicates must behave like Payload's server query arrays. */
export function articlesSearchParams(params: { getAll(name: string): string[] }): Record<string, unknown> {
  return Object.fromEntries(["q", "site", "status", "locale", "page"].map((key) => {
    const values = params.getAll(key);
    return [key, values.length > 1 ? values : values[0]];
  }));
}

/** Keep the selected content language explicit; omit empty filters and page one. */
export function articlesQueryString(query: ArticlesQuery): string {
  const params = new URLSearchParams({ locale: query.locale });
  if (query.q) params.set("q", query.q);
  if (query.site) params.set("site", query.site);
  if (query.status) params.set("status", query.status);
  if (query.page > 1) params.set("page", String(query.page));
  return params.toString();
}

export function hasArticleFilters(query: ArticlesQuery): boolean {
  return Boolean(query.q || query.site || query.status);
}

/** Reset the result scope and pagination, keeping the editor's content language. */
export function resetArticlesQuery(query: ArticlesQuery): ArticlesQuery {
  return { q: "", site: "", status: "", locale: query.locale, page: 1 };
}
