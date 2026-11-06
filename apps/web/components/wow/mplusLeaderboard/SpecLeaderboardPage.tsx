import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ListOrdered, Route, Sparkles, Users } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, MythicHubMotion } from "@/components/wow/shared/materialAtlas";
import { loadMythicPlusLeaderboard } from "@/lib/games/wow/mplusLeaderboard";
import {
  heroName, itemIconUrl, leaderboardClasses, leaderboardSearch, parseLeaderboardQuery, realmName, talentsUrl,
  type LeaderboardItem, type LeaderboardSpec, type LeaderboardSpecSummary,
} from "@/lib/games/wow/mplusLeaderboardView";
import { trail } from "@/lib/routes/registry";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { CopyLoadoutButton } from "./LeaderboardClient";
import { leaderboardCopy, type LeaderboardCopy } from "./leaderboardCopy";
import {
  LeaderboardFilters, LeaderboardPager, LeaderboardState, LeaderboardTable, RegionSwitch, SpecDirectory, SpecIcon,
  className, formatScore, formatShare, pageKit, roleKits, specName, type Locale,
} from "./LeaderboardParts";
import styles from "./leaderboard.module.css";

type Params = Record<string, string | string[] | undefined>;

/** /wow/mythic-plus/leaderboard/<spec>: the top 100 of one specialization and what they play. */
export async function SpecLeaderboardPage({ locale, spec, searchParams }: { locale: Locale; spec: LeaderboardSpec; searchParams: Promise<Params> }) {
  const copy = leaderboardCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const board = `${prefix}/wow/mythic-plus/leaderboard`;
  const action = `${board}/${spec.theme.slug}`;
  const query = parseLeaderboardQuery(await searchParams, spec.theme.specId);
  const result = await loadMythicPlusLeaderboard(query);
  const page = result.state === "ready" ? result.page : null;
  const name = specName(spec, locale);
  const cls = className(spec, locale);
  const title = copy.specTitle(name, cls);
  const crumbs = trail(locale, "mythicPlusLeaderboard", { label: title });
  const kit = roleKits[page?.summary?.role ?? "dps"];
  const siblings = leaderboardClasses.find((item) => item.classId === spec.theme.classId)?.specs ?? [];

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero style={{ "--class-color": spec.color } as CSSProperties}>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          eyebrow={page ? copy.eyebrow(page.season.name, copy.regions[page.region]) : copy.regions[query.region]}
          emblem={<Image src={spec.icon} alt="" width={62} height={62} sizes="62px" />}
          title={title}
          lede={copy.specLede(name, cls)}
          actions={page ? (
            <div className={styles.actions} data-hub-actions>
              <MaterialLinkButton kit={kit} fit="stack" href="#build" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.toBuild}</MaterialLinkButton>
              <MaterialLinkButton kit={pageKit} fit="stack" href="#list" icon={<ListOrdered aria-hidden="true" />}>{copy.listTitleFiltered(page.depth)}</MaterialLinkButton>
            </div>
          ) : undefined}
        />
        <RegionSwitch current={query.region} copy={copy} href={(region) => `${action}${leaderboardSearch({ region })}`} />
      </div>

      {!page ? (
        <>
          <MaterialPlaque kit={pageKit} className={styles.statePlaque}>
            <LeaderboardState state={result.state === "error" ? "error" : "empty"} copy={copy} />
          </MaterialPlaque>
          <div className={styles.stateActions}>
            <MaterialLinkButton kit={pageKit} fit="stack" href={`${prefix}/wow/mythic-plus/routes?specs=${spec.theme.specId}`} icon={<Route aria-hidden="true" />}>{copy.toRuns}</MaterialLinkButton>
            <MaterialLinkButton kit="den-of-nalorakk" fit="stack" href={`${prefix}/wow/mythic-plus/comps?specs=${spec.theme.specId}`} icon={<Users aria-hidden="true" />}>{copy.toComps}</MaterialLinkButton>
          </div>
        </>
      ) : (
        <>
          {page.status === "stale" ? <AtlasNotice tone="caution">{copy.stale}</AtlasNotice> : null}
          {page.summary ? <div data-hub-reveal><Build summary={page.summary} spec={spec} locale={locale} copy={copy} prefix={prefix} kit={kit} /></div> : null}
          <div data-hub-reveal>
            <AtlasSection id="list" className={styles.section} title={copy.listTitleFiltered(page.depth)}>
              <MaterialPlaque kit={pageKit} className={styles.tablePlaque}>
                <LeaderboardFilters page={page} query={query} action={action} locale={locale} copy={copy} fixedSpec />
                <LeaderboardTable page={page} locale={locale} copy={copy} prefix={prefix} fixedSpec />
                <LeaderboardPager page={page} query={{ ...query, specId: undefined }} action={action} copy={copy} />
              </MaterialPlaque>
            </AtlasSection>
          </div>
          <div data-hub-reveal>
            <AtlasSection id="specs" className={styles.section} title={copy.siblings}>
              <ul className={styles.siblings}>
                {siblings.filter((item) => item.theme.specId !== spec.theme.specId).map((item) => (
                  <li key={item.theme.specId}>
                    <a className={styles.sibling} href={`${board}/${item.theme.slug}${leaderboardSearch({ region: query.region })}`} style={{ "--class-color": item.color } as CSSProperties}>
                      <SpecIcon spec={item} size={36} /><span>{specName(item, locale)}</span>
                    </a>
                  </li>
                ))}
                <li>
                  <a className={styles.backLink} href={`${board}${leaderboardSearch({ region: query.region })}`}><ArrowLeft aria-hidden="true" />{copy.backToBoard}</a>
                </li>
              </ul>
              <details className={styles.allSpecs}>
                <summary>{copy.specsTitle}</summary>
                <SpecDirectory region={query.region} locale={locale} copy={copy} prefix={prefix} current={spec.theme.specId} />
              </details>
            </AtlasSection>
          </div>
        </>
      )}
    </AtlasFrame>
  );
}

function Build({ summary, spec, locale, copy, prefix, kit }: { summary: LeaderboardSpecSummary; spec: LeaderboardSpec; locale: Locale; copy: LeaderboardCopy; prefix: string; kit: (typeof roleKits)[keyof typeof roleKits] }) {
  const heroes = summary.heroes.filter((hero) => hero.count > 0);
  if (!heroes.length && !summary.trinkets.length) return null;
  return (
    <AtlasSection id="build" className={styles.section} title={copy.buildTitle}>
      <div className={styles.build}>
        {heroes.length ? (
          <MaterialPlaque as="section" kit={kit} className={styles.buildPlaque} aria-labelledby="build-hero">
            <h3 id="build-hero" className={styles.roleTitle}><Sparkles aria-hidden="true" />{copy.heroTitle}</h3>
            <ul className={styles.heroList}>
              {heroes.map((hero) => (
                <li key={hero.id} className={styles.heroItem}>
                  <span className={styles.heroHead}>
                    <b>{heroName(spec, hero.id, locale, hero.name)}</b>
                    <span className={styles.shareValue}>{formatShare(hero.share, locale)}</span>
                  </span>
                  <span className={styles.shareTrack} aria-hidden="true"><span style={{ inlineSize: `${Math.round(hero.share * 100)}%` }} /></span>
                  {hero.top ? (
                    <span className={styles.topBuild}>
                      <span className={styles.topBuildWho}>{copy.topBuild}: <b>{hero.top.name}</b> · {realmName(hero.top.realm, locale)} · {formatScore(hero.top.score, locale)}</span>
                      <span className={styles.topBuildActions}>
                        <CopyLoadoutButton loadout={hero.top.loadout} labels={{ label: copy.copy, copied: copy.copied, failed: copy.copyFailed }} />
                        <a className={styles.talentsLink} href={talentsUrl(spec, hero.top.loadout, hero.id, prefix)}><Sparkles aria-hidden="true" />{copy.talents}</a>
                      </span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </MaterialPlaque>
        ) : null}
        <ItemPlaque id="build-trinkets" title={copy.trinketsTitle} items={summary.trinkets} locale={locale} />
        <ItemPlaque id="build-weapons" title={copy.weaponsTitle} items={summary.weapons} locale={locale} />
      </div>
    </AtlasSection>
  );
}

const qualities = Object.values(itemQualityColors);
const qualityStyle = (name?: string) => {
  const quality = qualities.find((entry) => entry.name === name);
  return quality ? { "--quality-frame": quality.frame, "--quality-color": quality.text } as CSSProperties : undefined;
};

function ItemPlaque({ id, title, items, locale }: { id: string; title: string; items: LeaderboardItem[]; locale: Locale }) {
  if (!items.length) return null;
  return (
    <MaterialPlaque as="section" kit="kings-rest" className={styles.buildPlaque} aria-labelledby={id}>
      <h3 id={id} className={styles.roleTitle}>{title}</h3>
      <ul className={styles.itemList}>
        {items.map((item) => (
          <li key={item.id} className={styles.item} style={qualityStyle(item.quality)}>
            <span className={styles.itemIcon} aria-hidden="true">
              {item.icon ? <img src={itemIconUrl(item.icon)} alt="" width={36} height={36} loading="lazy" decoding="async" /> : null}
            </span>
            <span className={styles.itemText}>
              <a className={styles.itemName} href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}item=${item.id}`} target="_blank" rel="noreferrer">
                {(locale === "ru" && item.nameRu) || item.name}
              </a>
              <span className={styles.shareTrack} aria-hidden="true"><span style={{ inlineSize: `${Math.round(item.share * 100)}%` }} /></span>
            </span>
            <span className={styles.shareValue}>{formatShare(item.share, locale)}</span>
          </li>
        ))}
      </ul>
    </MaterialPlaque>
  );
}
