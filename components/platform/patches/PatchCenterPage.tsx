"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowRight, Bookmark, Check, ChevronRight, Filter, Flame, Radio, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import type { Lang } from "@/lib/i18n";
import type { PatchGroup, PlatformGameId, PlatformHomeData } from "@/lib/platform/home/types";
import styles from "./patchCenter.module.css";

type PatchKind = "all" | "buff" | "nerf" | "update";

const copy = {
  en: { title: "Patch Center", subtitle: "Every change. Every ripple.", allGames: "All Games", timeline: "Release Timeline", latest: "Latest intelligence", impact: "Signal impact", high: "High", buffs: "Buffs", nerfs: "Nerfs", updates: "Adjustments", changes: "Changes", all: "All changes", follow: "Followed", unfollow: "Follow", pulse: "Meta pulse", pulseHint: "Live distribution of tracked changes across your connected worlds.", movers: "Biggest movers", briefing: "Intelligence briefing", briefingText: "The current patch cycle is reshaping the tracked meta. Review changes before returning to your active builds.", read: "Open game hub", noChanges: "No changes match this filter.", source: "Database snapshot" },
  ru: { title: "Центр патчей", subtitle: "Каждое изменение. Каждая волна.", allGames: "Все игры", timeline: "Лента релизов", latest: "Свежая разведка", impact: "Влияние сигнала", high: "Высокое", buffs: "Усиления", nerfs: "Ослабления", updates: "Корректировки", changes: "Изменения", all: "Все изменения", follow: "Отслеживается", unfollow: "Отслеживать", pulse: "Пульс меты", pulseHint: "Живое распределение изменений во всех подключённых мирах.", movers: "Главные движения", briefing: "Сводка разведки", briefingText: "Текущий цикл патчей меняет отслеживаемую мету. Проверьте изменения перед возвращением к активным билдам.", read: "Открыть игру", noChanges: "Для этого фильтра изменений нет.", source: "Снимок базы" },
};

function count(group: PatchGroup, kind: Exclude<PatchKind, "all">) {
  return group.changes.filter((change) => change.kind === kind).length;
}

export function PatchCenterPage({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const t = copy[lang];
  const [selectedGame, setSelectedGame] = useState<"all" | PlatformGameId>("all");
  const [kind, setKind] = useState<PatchKind>("all");
  const [followed, setFollowed] = useState(true);
  const groups = selectedGame === "all" ? data.patchPulse : data.patchPulse.filter((group) => group.gameId === selectedGame);
  const featured = selectedGame === "all" ? data.patchPulse.at(-1)! : groups[0] ?? data.patchPulse[0];
  const game = data.games.find((candidate) => candidate.id === featured.gameId)!;
  const visibleChanges = featured.changes.filter((change) => kind === "all" || change.kind === kind);
  const totals = useMemo(() => ({
    buff: groups.reduce((sum, group) => sum + count(group, "buff"), 0),
    nerf: groups.reduce((sum, group) => sum + count(group, "nerf"), 0),
    update: groups.reduce((sum, group) => sum + count(group, "update"), 0),
  }), [groups]);
  const total = totals.buff + totals.nerf + totals.update;
  const impact = Math.min(96, 52 + total * 4 + totals.nerf * 3);
  const updated = new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(data.updatedAt));

  return <div className={homeStyles.page} data-platform-home>
    <PlatformMotion />
    <PlatformAtmosphere accent={game.accent} />
    <PlatformHeader data={data} lang={lang} active="patches" />
    <main className={styles.page}>
      <header className={styles.hero} data-reveal>
        <div><span><Radio />{t.latest}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
        <div className={styles.gameRail} role="radiogroup" aria-label={t.allGames}>
          <button role="radio" aria-checked={selectedGame === "all"} className={selectedGame === "all" ? styles.active : ""} onClick={() => { setSelectedGame("all"); setKind("all"); }}>{t.allGames}</button>
          {data.games.map((item) => <button role="radio" aria-label={item.name} aria-checked={selectedGame === item.id} className={selectedGame === item.id ? styles.active : ""} onClick={() => { setSelectedGame(item.id); setKind("all"); }} key={item.id}><img src={item.iconUrl} alt="" width="29" height="29" /><span>{item.name}</span></button>)}
        </div>
        <button className={followed ? styles.followed : styles.follow} onClick={() => setFollowed((value) => !value)} type="button">{followed ? <Check /> : <Bookmark />}<span>{followed ? t.follow : t.unfollow}</span></button>
      </header>

      <div className={styles.layout}>
        <aside className={styles.timeline} data-reveal>
          <div className={styles.panelTitle}><h2>{t.timeline}</h2><Filter /></div>
          <div className={styles.timelineList}>{groups.map((group, index) => {
            const item = data.games.find((candidate) => candidate.id === group.gameId)!;
            return <button className={group.gameId === featured.gameId ? styles.timelineActive : ""} onClick={() => setSelectedGame(group.gameId)} key={group.gameId}>
              <i /><small>{index === 0 ? updated : item.subtitle}</small><span><img src={item.iconUrl} alt="" width="43" height="43" /><b>{item.name}</b><em>{group.changes.length} {t.changes.toLocaleLowerCase()}</em></span>
            </button>;
          })}</div>
          <div className={styles.snapshot}><DatabaseMark /><span>{t.source}<small>{updated}</small></span></div>
        </aside>

        <section className={styles.core}>
          <article className={styles.releaseHero} data-reveal style={{ "--patch-accent": game.accent } as React.CSSProperties}>
            <img src={game.iconUrl} alt="" width="76" height="76" /><div><span>{game.subtitle}</span><h2>{game.name}</h2><p>{updated}</p></div>
            <div className={styles.impact}><small>{t.impact}</small><strong data-count>{impact}</strong><span>/100 · {t.high}</span><i><b style={{ width: `${impact}%` }} /></i></div>
          </article>
          <div className={styles.statGrid} data-reveal>
            <Stat icon={<TrendingUp />} value={totals.buff} label={t.buffs} tone="buff" />
            <Stat icon={<TrendingDown />} value={totals.nerf} label={t.nerfs} tone="nerf" />
            <Stat icon={<Sparkles />} value={totals.update} label={t.updates} tone="update" />
          </div>
          <article className={styles.metaPulse} data-reveal>
            <div className={styles.panelTitle}><div><h2>{t.pulse}</h2><p>{t.pulseHint}</p></div><Activity /></div>
            <div className={styles.pulseBars}>
              {data.patchPulse.map((group) => { const item = data.games.find((candidate) => candidate.id === group.gameId)!; const width = Math.max(18, group.changes.length / Math.max(...data.patchPulse.map((entry) => entry.changes.length)) * 100); return <div key={group.gameId}><span><img src={item.iconUrl} alt="" width="25" height="25" />{item.name}</span><i><b style={{ width: `${width}%`, background: item.accent }} /></i><strong>{group.changes.length}</strong></div>; })}
            </div>
          </article>
          <article className={styles.changePanel} data-reveal>
            <nav aria-label={t.changes}>{(["all", "buff", "nerf", "update"] as const).map((value) => <button className={kind === value ? styles.active : ""} onClick={() => setKind(value)} key={value}>{value === "all" ? t.all : value === "buff" ? t.buffs : value === "nerf" ? t.nerfs : t.updates}<span>{value === "all" ? featured.changes.length : count(featured, value)}</span></button>)}</nav>
            <div className={styles.changeList}>{visibleChanges.length ? visibleChanges.map((change, index) => <div className={styles.changeRow} key={`${change.kind}-${index}`}><span className={`${styles.kindIcon} ${styles[change.kind]}`}>{change.kind === "buff" ? <TrendingUp /> : change.kind === "nerf" ? <TrendingDown /> : <Sparkles />}</span><div><small>{game.name}</small><strong>{change.text}</strong></div><em className={styles[change.kind]}>{change.kind}</em><Bookmark /></div>) : <p className={styles.empty}>{t.noChanges}</p>}</div>
          </article>
        </section>

        <aside className={styles.insights}>
          <article data-reveal><div className={styles.panelTitle}><h2>{t.movers}</h2><Flame /></div>{data.patchPulse.map((group, index) => { const item = data.games.find((candidate) => candidate.id === group.gameId)!; const direction = count(group, "nerf") > count(group, "buff") ? "down" : "up"; return <div className={styles.mover} key={group.gameId}><b>{index + 1}</b><img src={item.iconUrl} alt="" width="31" height="31" /><span>{item.name}<small>{item.subtitle}</small></span><em className={styles[direction]}>{direction === "up" ? "▲" : "▼"} {group.changes.length * 4 + 2}</em></div>; })}</article>
          <article className={styles.briefing} data-reveal><ShieldCheck /><small>{t.briefing}</small><h2>{game.name}: {game.subtitle}</h2><p>{t.briefingText}</p><a href={game.href}>{t.read}<ArrowRight /></a></article>
        </aside>
      </div>
    </main>
  </div>;
}

function DatabaseMark() { return <span className={styles.databaseMark}><i /><i /><i /></span>; }

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: "buff" | "nerf" | "update" }) {
  return <article className={styles.stat}><span className={styles[tone]}>{icon}</span><strong className={styles[tone]} data-count>{value}</strong><div><b>{label}</b><small>{value ? `${value * 4 + 2}% signal strength` : "—"}</small></div></article>;
}
