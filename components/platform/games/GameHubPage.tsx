import Link from "next/link";
import { Database, Clock3, Radio, TrendingUp } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { PlatformGameId, PlatformHomeData } from "@/lib/platform/home/types";
import type { GameIntelligence, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { gameHubHref, gameHubIds, getGameHubDefinition } from "@/lib/platform/games/config";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import { GameHero } from "./GameHero";
import { GameDashboard } from "./GameDashboard";
import { preloadSharedWowBackdrop } from "@/lib/wow/sharedBackdropPreload";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import styles from "./gameHub.module.css";

type RoleSignalData = Record<TierRole, { entries: TierEntry[]; series: number[] }>;

function roleSignalData(entries: TierEntry[], metrics: GameIntelligence["metrics"]) {
  const series = entries.slice(0, 12).map((entry) => entry.score ?? entry.maxKey ?? Math.max(1, 100 - entry.rank * 3));
  return {
    entries: entries.slice(0, 8),
    series: series.length > 1 ? series : metrics.map((metric) => metric.value).slice(0, 12),
  };
}

export function GameHubPage({ data, intelligence, lang, gameId }: { data: PlatformHomeData; intelligence: GameIntelligence; lang: Lang; gameId: PlatformGameId }) {
  const baseDefinition = getGameHubDefinition(gameId, lang);
  const liveRelease = intelligence.version !== "—" && intelligence.version !== "live"
    ? gameId === "genshin" ? `Version ${intelligence.version}` : gameId === "league" ? `Patch ${intelligence.version}` : ""
    : "";
  const definition = liveRelease ? {
    ...baseDefinition,
    copy: { ...baseDefinition.copy, eyebrow: baseDefinition.copy.eyebrow.replace(/(VERSION|PATCH) [\d.]+/i, liveRelease.toUpperCase()) },
  } : baseDefinition;
  const gameSnapshot = data.games.find((item) => item.id === gameId) ?? { id: gameId, name: definition.name, subtitle: definition.signalLabel, href: gameHubHref(gameId, lang), accent: definition.accent, iconUrl: definition.iconUrl };
  const game = liveRelease ? { ...gameSnapshot, subtitle: liveRelease } : gameSnapshot;
  const meta = data.personalMeta.find((item) => item.gameId === gameId);
  const active = data.continueItems.find((item) => item.gameId === gameId);
  const build = data.savedBuilds.find((item) => item.gameId === gameId);
  const patch = data.patchPulse.find((item) => item.gameId === gameId);
  const recommendation = data.recommendations.find((item) => item.gameId === gameId);
  const roleSignals: RoleSignalData | undefined = intelligence.roles ? {
    dps: roleSignalData(intelligence.roles.dps, intelligence.metrics),
    healer: roleSignalData(intelligence.roles.healer, intelligence.metrics),
    tank: roleSignalData(intelligence.roles.tank, intelligence.metrics),
  } : undefined;
  const updated = Date.parse(intelligence.updatedAt) > 0
    ? new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(intelligence.updatedAt))
    : "—";
  const primaryMetric = intelligence.metrics[0];
  if (gameId === "wow") preloadSharedWowBackdrop();

  return (
    <div className={`${homeStyles.page} ${styles.shell}`} data-platform-home data-game={gameId} style={{ "--hub-accent": definition.accent, "--hub-soft": definition.accentSoft } as React.CSSProperties}>
      <PlatformMotion />
      <PlatformAtmosphere accent={definition.accent} />
      <PlatformHeader data={data} lang={lang} active="game" scopeLabel={definition.name} />
      <main className={styles.page}>
        <nav className={styles.gameSwitch} aria-label={lang === "ru" ? "Игровые миры" : "Game worlds"} data-reveal>
          {gameHubIds.map((id) => { const item = getGameHubDefinition(id, lang); return <Link href={gameHubHref(id, lang)} aria-current={id === gameId ? "page" : undefined} className={id === gameId ? styles.gameActive : ""} key={id}><img src={item.iconUrl} alt="" width="27" height="27" /><span>{item.name}</span><i /></Link>; })}
        </nav>

        <GameHero definition={definition} game={game} meta={meta} active={active} lang={lang} />

        <section className={styles.statusRail} data-reveal>
          <div><Radio /><span><small>{intelligence.status === "unavailable" ? (lang === "ru" ? "Подключение данных" : "Data connection") : definition.copy.database}</small><b>{intelligence.providerLabel}</b></span><i className={`${styles.liveDot} ${styles[intelligence.status]}`} /></div>
          <div><TrendingUp /><span><small>{primaryMetric?.label ?? definition.copy.score}</small><b data-count>{primaryMetric?.value ?? "—"}</b></span></div>
          <div><Database /><span><small>{lang === "ru" ? "Версия данных" : "Data version"}</small><b>{intelligence.version}</b></span></div>
          <div><Clock3 /><span><small>{definition.copy.updated}</small><b>{updated} UTC</b></span></div>
        </section>

        <GameDashboard definition={definition} intelligence={intelligence} lang={lang} meta={meta} active={active} build={build} patch={patch} recommendation={recommendation} roleSignals={roleSignals} />
      </main>
    </div>
  );
}
