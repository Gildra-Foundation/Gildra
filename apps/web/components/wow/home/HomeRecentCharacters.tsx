"use client";
import { useEffect, useSyncExternalStore } from "react";
import { readRecentPages, rememberPage, type RecentPage } from "@/components/platform/search/recentPages";
import styles from "./wowHome.module.css";

const isProfile = (page: RecentPage) => /^\/wow\/players\/(eu|us|kr|tw)\/[^/?#]+\/[^/?#]+$/.test(page.h);

const subscribe = (listener: () => void) => { window.addEventListener("storage", listener); return () => window.removeEventListener("storage", listener); };
const snapshot = () => JSON.stringify(readRecentPages());
const serverSnapshot = () => "[]";

/** One reserved line: hydration never moves the form or following content. */
export function HomeRecentCharacters({ locale, label }: { locale: "en" | "ru"; label: string }) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const pages = (JSON.parse(stored) as RecentPage[]).filter(isProfile).slice(0, 2);
  useEffect(() => {
    const form = document.getElementById("character-lookup") as HTMLFormElement | null;
    const save = () => {
      if (!form?.checkValidity()) return;
      const data = new FormData(form);
      const region = String(data.get("region") ?? "");
      const realm = String(data.get("realm") ?? "").trim().replace(/\s+/g, "-").toLowerCase();
      const name = String(data.get("name") ?? "").trim();
      if (!/^(eu|us|kr|tw)$/.test(region) || !/^[\p{L}0-9'-]{2,64}$/u.test(realm) || !/^[\p{L}]{2,12}$/u.test(name)) return;
      rememberPage(`/wow/players/${region}/${encodeURIComponent(realm)}/${encodeURIComponent(name.toLowerCase())}`, `${name} · ${realm}`);
    };
    form?.addEventListener("submit", save);
    return () => form?.removeEventListener("submit", save);
  }, []);
  return <div className={styles.recentSlot}>{pages.length > 0 && <nav aria-label={label} className={styles.recentCharacters}>{pages.map(page => <a key={page.h} href={`${locale === "ru" ? "/ru" : ""}${page.h}`}>{page.t.replace(/\s*[—|]\s*(Gildra|WowArcana).*$/i, "")}</a>)}</nav>}</div>;
}
