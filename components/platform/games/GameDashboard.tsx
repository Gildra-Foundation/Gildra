import Link from "next/link";
import {
  Activity, ArrowRight, BarChart3, Database, Crosshair, Map, Radar,
  Shield, Sparkles, Swords,
} from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { ContinueItem, PatchGroup, PersonalMetaRow, Recommendation, SavedBuild } from "@/lib/platform/home/types";
import type { GameHubDefinition, HubIcon } from "@/lib/platform/games/config";
import type { GameIntelligence, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { OptimizedResilientImage } from "@/components/media/OptimizedResilientImage";
import { GameTierSignal } from "./GameTierSignal";
import styles from "./gameHub.module.css";

const icons: Record<HubIcon, typeof Radar> = {
  radar: Radar, swords: Swords, route: Map, database: Database,
  sparkles: Sparkles, shield: Shield, target: Crosshair, chart: BarChart3,
};

function GameEntityIcon({ src }: { src?: string }) {
  const fallback = <span className={styles.entityFallback}><Database /></span>;
  return <OptimizedResilientImage src={src} alt="" width={48} height={48} sizes="48px" loading="lazy" fallback={fallback} />;
}

type RoleSignalData = Record<TierRole, { entries: TierEntry[]; series: number[] }>;

type Props = {
  definition: GameHubDefinition;
  intelligence: GameIntelligence;
  lang: Lang;
  meta?: PersonalMetaRow;
  active?: ContinueItem;
  build?: SavedBuild;
  patch?: PatchGroup;
  recommendation?: Recommendation;
  roleSignals?: RoleSignalData;
};

function localHref(href: string, lang: Lang) {
  if (lang === "ru") return href === "/ru" || href.startsWith("/ru/") ? href : `/ru${href}`;
  return href.startsWith("/ru/") ? href.slice(3) : href;
}

export function GameDashboard({ definition, intelligence, lang, meta, active, build, patch, recommendation, roleSignals }: Props) {
  const prefix = lang === "ru" ? "/ru" : "";
  const compareHref = definition.id === "diablo" ? `${prefix}/profile/arcanist` : `${prefix}/compare?game=${definition.id}`;
  const formatNumber = (value: number) => new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

  return (
    <div className={styles.dashboard}>
      <section className={styles.modulePanel} data-reveal>
        <header className={styles.panelHeading}><div><span>{definition.copy.commandDeck}</span><h2>{definition.copy.modules}</h2></div><p>{definition.copy.modulesHint}</p></header>
        <div className={styles.moduleGrid}>
          {definition.modules.map((module) => {
            const Icon = icons[module.icon];
            return <Link href={localHref(module.href, lang)} className={styles.moduleCard} key={module.title} data-reveal-item>
              <span className={styles.moduleIcon}><Icon /></span><small>{intelligence.status === "unavailable" ? (lang === "ru" ? "ПРЕВЬЮ" : "PREVIEW") : module.badge}</small><h3>{module.title}</h3><p>{module.description}</p><b>{definition.copy.open}<ArrowRight /></b>
            </Link>;
          })}
        </div>
      </section>

      <aside className={styles.sideStack}>
        <section className={styles.continuePanel} data-reveal>
          <header><span><Activity />{definition.copy.continue}</span><small>{active?.activity ?? meta?.mode}</small></header>
          <div className={styles.continueBody}>
            <OptimizedResilientImage src={active?.imageUrl ?? meta?.focusIconUrl ?? definition.iconUrl} alt="" width={72} height={82} sizes="65px" loading="lazy" fallback={<img src={definition.iconUrl} alt="" width="72" height="82" />} />
            <div><h2>{active?.title ?? meta?.focus ?? definition.name}</h2><p>{active?.activityDetail ?? meta?.focusDetail}</p><span><i data-progress style={{ width: `${active?.progress ?? 64}%` }} /></span><small>{active?.progress ?? 64}%</small></div>
          </div>
          <Link href={`${prefix}/profile/arcanist`}>{definition.copy.continue}<ArrowRight /></Link>
        </section>

        <section className={styles.patchPanel} data-reveal>
          <header><span>{definition.copy.patchIntel}</span><Link href={`${prefix}/patches`}>{definition.copy.open}<ArrowRight /></Link></header>
          <div>{patch?.changes.map((change) => <article key={change.text}><i className={styles[change.kind]}>{change.kind === "buff" ? "↑" : change.kind === "nerf" ? "↓" : "✦"}</i><p>{change.text}</p><small>{change.kind}</small></article>)}</div>
          {!patch?.changes.length ? <p className={styles.noSignal}>{lang === "ru" ? "Новых сигналов нет." : "No new signals."}</p> : null}
        </section>
      </aside>

      {intelligence.mode === "tier-list" && roleSignals ? <GameTierSignal
        accent={definition.accent}
        signalLabel={definition.copy.metaSignal}
        lang={lang}
        providerLabel={intelligence.providerLabel}
        roles={roleSignals}
      /> : <section className={styles.signalPanel} data-reveal>
        <header className={styles.signalHeading}>
          <div><span>{intelligence.providerLabel}</span><h2>{intelligence.mode === "tier-list" ? (lang === "ru" ? "Живой тир-лист Mythic+" : "Live Mythic+ tier list") : intelligence.mode === "catalog" ? (lang === "ru" ? "Живая библиотека" : "Live library") : (lang === "ru" ? "Подключение данных" : "Data connection")}</h2></div>
          <span className={`${styles.sourceState} ${styles[intelligence.status]}`}>{intelligence.status === "live" ? "LIVE" : intelligence.status.toUpperCase()}</span>
        </header>
        {intelligence.mode === "catalog" ? <div className={styles.catalogSignalContent}>
          <div className={styles.catalogMetrics}>{intelligence.metrics.map((metric) => {
            const body = <><strong data-count>{formatNumber(metric.value)}</strong><span>{metric.label}</span></>;
            return metric.href ? <Link href={metric.href} key={metric.label}>{body}<ArrowRight /></Link> : <div key={metric.label}>{body}</div>;
          })}</div>
          <div className={styles.entityStrip}>{intelligence.entities.map((entity) => <Link href={entity.href} className={styles.entityCard} key={entity.id} data-reveal-item>
            <GameEntityIcon src={entity.imageUrl} />
            <span><strong>{entity.name}</strong><small>{entity.subtitle}</small></span><ArrowRight />
          </Link>)}</div>
        </div> : <div className={styles.pendingSignal}>
          <Database /><div><strong>{lang === "ru" ? "Ожидается провайдер данных" : "Waiting for a data provider"}</strong><p>{intelligence.message}</p></div>
        </div>}
      </section>}

      <section className={styles.buildPanel} data-reveal>
        <header><span>{definition.copy.activeBuild}</span><small>{build?.updatedAt}</small></header>
        <div className={styles.buildBody}>
          <OptimizedResilientImage src={build?.imageUrl ?? meta?.focusIconUrl ?? definition.iconUrl} alt="" width={62} height={62} sizes="58px" loading="lazy" fallback={<img src={definition.iconUrl} alt="" width="62" height="62" />} />
          <div><h2>{build?.title ?? meta?.focus ?? definition.name}</h2><p>{build?.subtitle ?? meta?.focusDetail}</p></div>
          <strong>{meta?.score ?? "—"}<small>{definition.copy.score}</small></strong>
        </div>
        <Link href={compareHref}>{definition.copy.open}<ArrowRight /></Link>
      </section>

      {recommendation ? <Link href={`${prefix}/search?game=${definition.id}`} className={styles.briefing} data-reveal>
        <OptimizedResilientImage src={recommendation.imageUrl} alt="" width={108} height={94} sizes="(max-width: 760px) 65px, 70px" loading="lazy" fallback={<img src={definition.iconUrl} alt="" width="108" height="94" />} />
        <span><small>{recommendation.eyebrow}</small><h2>{recommendation.title}</h2><p>{recommendation.description}</p></span><ArrowRight />
      </Link> : null}
    </div>
  );
}
