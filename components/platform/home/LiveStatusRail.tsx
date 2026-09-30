"use client";

import { Activity, Database, Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import styles from "./platformHome.module.css";

export function LiveStatusRail({ lang, worlds, updatedAt }: { lang: Lang; worlds: number; updatedAt: string }) {
  const [clock, setClock] = useState("--:--");
  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [lang]);
  const updated = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(updatedAt));
  return <aside className={styles.statusRail} data-reveal aria-label={lang === "ru" ? "Статус платформы" : "Platform status"}>
    <span className={styles.liveSignal}><Radio />{lang === "ru" ? "Живая разведка" : "Live intelligence"}<i><b /><b /><b /></i></span>
    <span><Sparkles />{worlds} {lang === "ru" ? "мира связаны" : "worlds connected"}</span>
    <span><Database />{lang === "ru" ? "Снимок" : "Snapshot"}: {updated}</span>
    <time><Activity />{clock} UTC</time>
  </aside>;
}
