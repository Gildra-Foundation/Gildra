"use client";
import { weeklyWorldBossCopy } from "./weeklyWorldBossCopy";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AtlasSection, AtlasPanel, AtlasField, AtlasSelect } from "@/components/atlas";
import { confirmedWeeklyBoss, type WeeklyWorldBossRecord, type WorldBossRegion } from "@/lib/wow/weeklyWorldBoss";
const regions: WorldBossRegion[] = ["eu", "us", "kr", "tw"];
export function WeeklyWorldBoss({ locale, records, bosses }: { locale: "ru" | "en"; records: WeeklyWorldBossRecord[]; bosses: { slug: string; name: string; zone: string }[] }) {
  const ru = locale === "ru";
  const copy = weeklyWorldBossCopy[locale];
  const [region, setRegion] = useState<WorldBossRegion>("eu");
  // Never publish a build-time clock as the current week. Verify the live
  // browser clock on mount, focus and every start/reset boundary.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const restore = () => { const value = new URLSearchParams(location.search).get("region") as WorldBossRegion; setRegion(regions.includes(value) ? value : "eu"); };
    restore(); window.addEventListener("popstate", restore);
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 30_000); window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("popstate", restore); window.removeEventListener("focus", refresh); };
  }, []);
  const record = now === null ? null : confirmedWeeklyBoss(records, region, now);
  useEffect(() => {
    if (now === null) return;
    const nextBoundary = records.flatMap(r => [Date.parse(r.startsAt), Date.parse(r.expiresAt)]).filter(at => at > now).sort((a,b) => a-b)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(nextBoundary - Date.now() + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [records, now]);
  const boss = record && bosses.find(b => b.slug === record.slug);
  return <AtlasSection id="weekly-boss" title={copy.title}>
    <AtlasField label={copy.region} htmlFor="weekly-region"><AtlasSelect id="weekly-region" value={region} onChange={e => { const next = e.target.value as WorldBossRegion; setRegion(next); const url = new URL(location.href); url.searchParams.set("region", next); history.pushState(history.state, "", `${url.pathname}${url.search}`); }}>{regions.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}</AtlasSelect></AtlasField>
    <AtlasPanel><div role="status">{record && boss ? <><h3><Link href={`${ru ? "/ru" : ""}/wow/lairs/${boss.slug}`}>{boss.name}</Link></h3><p>{boss.zone} · {region.toUpperCase()}</p><p>{copy.confirmedUntil}: <time dateTime={record.expiresAt}>{new Date(record.expiresAt).toLocaleString(copy.dateLocale, {timeZone: "UTC"})} UTC</time></p><a href={record.sourceUrl} target="_blank" rel="noreferrer">{copy.confirmationSource}</a></> : <p>{now === null ? copy.checking : copy.unconfirmed(region.toUpperCase())}</p>}</div></AtlasPanel>
  </AtlasSection>;
}
