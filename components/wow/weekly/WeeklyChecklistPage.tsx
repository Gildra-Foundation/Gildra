"use client";

import Link from "next/link";
import { Check, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./weeklyChecklistSafe.module.css";

type Locale = "ru" | "en";
type LocalText = { ru: string; en: string };

type PlannerActivity = {
  id: string;
  title: LocalText;
  description: LocalText;
  href: string | null;
};

const SOURCE_URL = "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live";
const VERIFIED_AT = "2026-09-13";

const ACTIVITIES: PlannerActivity[] = [
  {
    id: "raid",
    title: { ru: "The Venomous Abyss", en: "The Venomous Abyss" },
    description: { ru: "Рейд Midnight Season 2", en: "Midnight Season 2 raid" },
    href: "/wow/raids/venomous-abyss",
  },
  {
    id: "mythic-plus",
    title: { ru: "Mythic+ Season 2", en: "Mythic+ Season 2" },
    description: { ru: "Текущий сезонный пул подземелий", en: "Current seasonal dungeon pool" },
    href: "/wow/mythic-plus/seasons/midnight-season-2",
  },
  {
    id: "delves",
    title: { ru: "Delves Season 2", en: "Delves Season 2" },
    description: { ru: "Сезонные вылазки", en: "Seasonal Delves" },
    href: "/wow/delves",
  },
  {
    id: "prey",
    title: { ru: "Prey Season 2", en: "Prey Season 2" },
    description: { ru: "Сезонная активность на Coiled Isle", en: "Seasonal activity on the Coiled Isle" },
    href: null,
  },
  {
    id: "lairs",
    title: { ru: "Lairs Season 2", en: "Lairs Season 2" },
    description: { ru: "Инстансовые встречи с мировыми боссами", en: "Instanced world-boss encounters" },
    href: "/wow/lairs",
  },
];

function storageKey() {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return `gildra-wow-weekly-planner-${monday.toISOString().slice(0, 10)}`;
}

export function WeeklyChecklistPage({ locale }: { locale: Locale }) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const prefix = locale === "ru" ? "/ru" : "";
  const text = (value: LocalText) => value[locale];

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey());
      setCompleted(stored ? JSON.parse(stored) : {});
    } catch {
      setCompleted({});
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(storageKey(), JSON.stringify(completed));
  }, [completed, loaded]);

  const completedCount = useMemo(() => ACTIVITIES.filter((activity) => completed[activity.id]).length, [completed]);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>World of Warcraft · Midnight · Patch 12.1</p>
        <h1>{locale === "ru" ? "Личный план на неделю" : "Personal weekly planner"}</h1>
        <p>{locale === "ru"
          ? "Отмечайте активности вручную. Страница не импортирует персонажей, игровой прогресс, награды или лимиты и не выдаёт тестовые значения за реальные данные."
          : "Mark activities manually. This page does not import characters, game progress, rewards, or caps, and it does not present test values as real data."}</p>
        <div className={styles.verified}><ShieldCheck aria-hidden="true" />{locale === "ru" ? `Состав активностей проверен ${VERIFIED_AT}` : `Activity roster verified ${VERIFIED_AT}`}</div>
      </header>

      <section className={styles.summary} aria-live="polite">
        <strong>{completedCount} / {ACTIVITIES.length}</strong>
        <span>{locale === "ru" ? "отмечено пользователем" : "marked by you"}</span>
        <button type="button" onClick={() => setCompleted({})} disabled={!completedCount}>
          <RotateCcw aria-hidden="true" />{locale === "ru" ? "Сбросить" : "Reset"}
        </button>
      </section>

      <ul className={styles.list}>
        {ACTIVITIES.map((activity) => {
          const isComplete = Boolean(completed[activity.id]);
          return (
            <li key={activity.id} className={isComplete ? styles.complete : undefined}>
              <button
                type="button"
                aria-pressed={isComplete}
                aria-label={`${text(activity.title)}: ${isComplete ? (locale === "ru" ? "отмечено" : "marked") : (locale === "ru" ? "не отмечено" : "not marked")}`}
                onClick={() => setCompleted((current) => ({ ...current, [activity.id]: !current[activity.id] }))}
              >
                <Check aria-hidden="true" />
              </button>
              <div><h2>{text(activity.title)}</h2><p>{text(activity.description)}</p></div>
              {activity.href ? <Link href={`${prefix}${activity.href}`}>{locale === "ru" ? "Открыть" : "Open"}</Link> : <span>{locale === "ru" ? "Страница проходит проверку" : "Page pending verification"}</span>}
            </li>
          );
        })}
      </ul>

      <footer className={styles.source}>
        <p>{locale === "ru"
          ? "Цели, пороги Великого хранилища, item level и награды не показываются без отдельной проверки источника."
          : "Objectives, Great Vault thresholds, item levels, and rewards are withheld until separately source-verified."}</p>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">{locale === "ru" ? "Официальный источник Blizzard" : "Official Blizzard source"}<ExternalLink aria-hidden="true" /></a>
      </footer>
    </main>
  );
}
