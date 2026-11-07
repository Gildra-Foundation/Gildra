import type { CSSProperties } from "react";
import { ArrowUpRight, HeartPulse, Shield, Swords } from "lucide-react";
import {
  AtlasEmpty, AtlasError, AtlasFrame, AtlasHero, AtlasSection,
} from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import {
  MythicHubBackdrop, MythicHubLinkButton as AtlasLinkButton, MythicHubMotion, mythicHubButtonLayout, mythicHubControlLayout,
} from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { loadMythicPlusMeta } from "@/lib/games/wow/mythicPlusMeta";
import { metaRoles, mythicPlusMetaView, type MetaRole, type MetaSpec, type MythicPlusMetaView } from "@/lib/games/wow/mythicPlusMetaView";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { loadSpecBoards, type SpecBoard } from "@/lib/games/wow/classMeta";
import { trail } from "@/lib/routes/registry";
import { Delta, formatPresence, PresenceBar, SpecIdentity, Sparkline, trendLabel } from "./MetaParts";
import { mythicMetaCopy, type MythicMetaCopy } from "./mythicMetaCopy";
import styles from "./mythicMeta.module.css";

type Locale = "en" | "ru";

const themeFor = (spec: MetaSpec) => talentSpecThemes.find((theme) => theme.slug === spec.key.split(":").reverse().join("-"));
/** Painted materials of the Mythic+ kit: one dungeon set per role plaque, Voidscar for the page itself (as on the hub's meta link). */
const pageKit: DungeonSlug = "voidscar-arena";
const roleKits: Record<MetaRole, DungeonSlug> = { tank: "den-of-nalorakk", healer: "the-blinding-vale", dps: "ruby-life-pools" };
const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } satisfies Record<MetaRole, unknown>;
const kitStyle = (slug: DungeonSlug) => ({ ...mythicHubControlLayout(slug), "--meta-kit-accent": dungeonArtDirections[slug].accent } as CSSProperties);
const number = (value: number, locale: Locale, digits = 0) => value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Weekly key presence, grouped by role. Hero choices are a separate leaderboard sample. */
export async function MythicMetaPage({ locale }: { locale: Locale }) {
  const copy = mythicMetaCopy[locale];
  const result = await loadMythicPlusMeta();
  const view = result.state === "ready" ? mythicPlusMetaView(result.meta.data) : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.breadcrumb });

  if (result.state !== "ready" || !view) {
    return (
      <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
        <MythicHubBackdrop />
        <div className={styles.hero}>
          <AtlasHero align="start" className={styles.heroHeader} breadcrumbs={crumbs} title={copy.title} lede={copy.lede} />
        </div>
        <div className={styles.statePlaque} style={kitStyle(pageKit)}>
          {result.state === "error"
            ? <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
            : <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>}
        </div>
      </AtlasFrame>
    );
  }

  const season = copy.season(view.season.number, view.season.label);
  const eyebrow = `${season} · ${copy.week(view.week.week)}`;
  const stats = [
    { value: number(view.week.averageKey, locale, 1), label: copy.averageKey },
    ...(view.period ? [
      { value: number(view.period.keys, locale), label: copy.keys },
      { value: number(view.period.unique_characters, locale), label: copy.characters },
    ] : []),
  ];
  const themes = metaRoles.flatMap((role) => view.roles[role]).flatMap((spec) => { const theme = themeFor(spec); return theme ? [theme] : []; });
  const boards = await loadSpecBoards(themes);
  const ctx = { view, copy, locale };

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          eyebrow={eyebrow}
          title={copy.title}
          lede={copy.lede}
          actions={<nav className={styles.actions} aria-label={copy.rolesLabel} data-hub-actions>
            {metaRoles.map((role) => { const Icon = roleIcons[role]; return <span key={role} className={styles.actionSlot} style={mythicHubButtonLayout(roleKits[role])}><AtlasLinkButton className={styles.assetButton} href={`#${role}`} icon={<Icon aria-hidden="true" />}>{copy.roles[role]}</AtlasLinkButton></span>; })}
          </nav>}
        />
        <div className={styles.weekFacts}>
          <AtlasStats label={copy.statsLabel} items={stats} />
          {view.period?.affixes.length ? (
            <ul className={styles.affixes} aria-label={copy.affixes}>
              {view.period.affixes.map((affix) => <li key={affix} lang="en">{affix}</li>)}
            </ul>
          ) : null}
        </div>
      </div>
      {metaRoles.map((role) => <div key={role} data-hub-reveal><RoleSection role={role} boards={boards} {...ctx} /></div>)}
    </AtlasFrame>
  );
}

type Ctx = { view: MythicPlusMetaView; copy: MythicMetaCopy; locale: Locale };

function RoleSection({ role, view, copy, locale, boards }: Ctx & { role: MetaRole; boards: Record<string, SpecBoard> }) {
  const Icon = roleIcons[role];
  const prefix = locale === "ru" ? "/ru" : "";
  const cards = view.roles[role].map((spec) => {
    const theme = themeFor(spec);
    const hero = theme ? boards[theme.slug]?.heroes[0] : undefined;
    const heroLabel = theme?.heroPaths.find((path) => path.id === hero?.id);
    return (
      <li key={spec.key} className={styles.specCard} data-leader={spec.rank === 1 || undefined} style={{ "--class-color": spec.color } as CSSProperties}>
        <div className={styles.cardHead}>
          <span className={styles.rank}>{String(spec.rank).padStart(2, "0")}</span>
          {theme ? <a className={styles.specLink} href={`${prefix}/wow/classes/${spec.classSlug}/${theme.slug}`}><SpecIdentity spec={spec} /></a> : <SpecIdentity spec={spec} />}
        </div>
        <div className={styles.cardNumbers}>
          <b aria-label={`${copy.presence}: ${formatPresence(spec.presence, locale)}`}>{formatPresence(spec.presence, locale)}</b>
          <span title={copy.change}><Delta value={spec.delta} copy={copy} locale={locale} /></span>
          <Sparkline values={spec.trend} label={trendLabel(spec, copy, locale)} width={88} />
        </div>
        <PresenceBar value={spec.presence} max={100} />
        {hero && theme ? <a className={styles.heroTree} href={`${prefix}/talents/${theme.slug}?hero=${hero.id}`} title={copy.heroSample}>
          <span>{heroLabel ? (locale === "ru" ? heroLabel.nameRu : heroLabel.name) : hero.name}</span><b>{formatPresence(hero.share * 100, locale)}</b>
        </a> : null}
        {theme ? <nav className={styles.specActions} aria-label={`${spec.specName} ${spec.className}`}>
          <a href={`${prefix}/talents/${theme.slug}`}>{copy.talents}<ArrowUpRight aria-hidden="true" /></a>
          <a href={`${prefix}/wow/classes/${spec.classSlug}/${theme.slug}`}>{copy.spec}<ArrowUpRight aria-hidden="true" /></a>
          <a href={`${prefix}/wow/mythic-plus/leaderboard/${theme.slug}`}>{copy.leaderboard}<ArrowUpRight aria-hidden="true" /></a>
        </nav> : null}
      </li>
    );
  });
  const fold = role === "dps" && cards.length > 9;
  return (
    <AtlasSection id={role} className={styles.section} title={copy.roles[role]}>
      <div className={styles.rolePlaque} style={kitStyle(roleKits[role])}>
        <div className={styles.roleLegend}><Icon aria-hidden="true" /><span>{copy.presence}</span><span>{copy.change}</span><span>{copy.trend}</span></div>
        <ol className={styles.specGrid}>{fold ? cards.slice(0, 6) : cards}</ol>
        {fold ? <details className={styles.moreSpecs}><summary>{copy.moreSpecs}</summary><ol start={7} className={styles.specGrid}>{cards.slice(6)}</ol></details> : null}
      </div>
    </AtlasSection>
  );
}
