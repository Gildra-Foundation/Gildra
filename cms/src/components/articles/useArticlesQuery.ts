"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { articlesQueryString, articlesSearchParams, normalizeArticlesQuery, type ArticlesQuery } from "../../articles/query";
import { searchText } from "../workspace/query";

/** Next's native history integration keeps filters in Back/Forward without a full route fetch. */
export function useArticlesQuery(initial: ArticlesQuery) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = normalizeArticlesQuery(articlesSearchParams(searchParams), initial.locale);
  const [search, setSearch] = useState(initial.q);

  useEffect(() => {
    // Keep a just-typed trailing space; history navigation restores a different query.
    setSearch((current) => searchText(current) === query.q ? current : query.q);
  }, [query.q]);

  const navigate = (next: ArticlesQuery, replace = false) => {
    const url = `${pathname}?${articlesQueryString(next)}`;
    if (`${window.location.pathname}${window.location.search}` === url) return;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  };

  return {
    query,
    search,
    navigate,
    searchFor(value: string) {
      setSearch(value);
      // Search edits replace one entry; site, status, language and pagination are Back steps.
      navigate(normalizeArticlesQuery({ ...query, q: value, page: 1 }, initial.locale), true);
    },
  };
}
