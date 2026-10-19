"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { loadIndex, openSiteSearch } from "@/components/platform/search/siteSearchIndex";
import { searchIndex, type SiteSearchHit } from "@/components/platform/search/siteSearchMatch";
import styles from "./notFoundSuggestions.module.css";

const copy = {
  en: { title: "Maybe you were looking for", search: "Search the site" },
  ru: { title: "Возможно, вы искали", search: "Искать на сайте" },
};

const subscribe = () => () => {};
const pathOf = () => window.location.pathname;

/** Words of the lost address: "/ru/wow/raid/voidspire-boss" → "voidspire boss". */
function wordsOf(path: string) {
  const segments = path.replace(/^\/ru(?=\/|$)/, "").split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const last = segments.at(-1) ?? "";
  return { last: last.replace(/[-_]+/g, " "), all: segments.join(" ").replace(/[-_]+/g, " ") };
}

/** 404 helper: pages of the site whose names match the lost address, and the quick search with it. */
export function NotFoundSuggestions() {
  const path = useSyncExternalStore(subscribe, pathOf, () => "");
  const ru = /^\/ru(?:\/|$)/.test(path);
  const text = copy[ru ? "ru" : "en"];
  const [hits, setHits] = useState<SiteSearchHit[] | null>(null);
  const { last, all } = wordsOf(path);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    loadIndex().then((index) => {
      if (!alive) return;
      const entries = index[ru ? "ru" : "en"];
      // The last segment first, then each of its words, then every word of the path.
      const tries = [last, ...last.split(" "), ...all.split(" ")].filter((word, position, list) => word.length > 2 && list.indexOf(word) === position && !/^(wow|ru)$/.test(word));
      const found = new Map<string, SiteSearchHit>();
      for (const query of tries) {
        for (const hit of searchIndex(entries, query, 6)) if (!found.has(hit.h)) found.set(hit.h, hit);
        if (found.size >= 6) break;
      }
      setHits([...found.values()].slice(0, 6));
    }, () => { if (alive) setHits([]); });
    return () => { alive = false; };
  }, [path, ru, last, all]);

  if (!path) return null;
  const prefix = ru ? "/ru" : "";
  const search = <AtlasButton variant="secondary" icon={<Search aria-hidden="true" />} onClick={() => openSiteSearch(last)}>{text.search}</AtlasButton>;
  // Without matches (or while the index loads) only the search action, never an empty heading.
  if (!hits?.length) return <div className={styles.searchOnly}>{search}</div>;
  return (
    <AtlasSection title={text.title} aside={search}>
      <ul className={styles.list}>
        {hits.map((hit) => (
          <li key={hit.h}>
            <Link href={`${prefix}${hit.h}`} className={styles.link}>
              <span className={styles.title}>{hit.t}</span>
              <span className={styles.kind}>{hit.s}</span>
              <ArrowRight aria-hidden="true" className={styles.arrow} />
            </Link>
          </li>
        ))}
      </ul>
    </AtlasSection>
  );
}
