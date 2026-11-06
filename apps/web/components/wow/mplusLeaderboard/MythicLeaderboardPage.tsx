import type { CSSProperties } from "react";
import { ArrowDown, ChartNoAxesColumn, HeartPulse, LayoutGrid, Shield, Swords, Users } from "lucide-react";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, MythicHubMotion, MythicHubOrnaments } from "@/components/wow/shared/materialAtlas";
import { loadMythicPlusLeaderboard } from "@/lib/games/wow/mplusLeaderboard";
import { loadMythicPlusStats } from "@/lib/games/wow/mythicPlusRuns";
import type { RegionCutoffs } from "@/lib/games/wow/mythicPlusRunsTypes";
import {
  leaderboardRoles, leaderboardSearch, leaderboardSpec, parseLeaderboardQuery,
  type LeaderboardPage, type LeaderboardRole,
} from "@/lib/games/wow/mplusLeaderboardView";
import { trail } from "@/lib/routes/registry";
import { leaderboardCopy, type LeaderboardCopy } from "./leaderboardCopy";
import {
  LeaderboardFilters, LeaderboardPager, LeaderboardState, LeaderboardTable, PlayerName, RegionSwitch, SpecDirectory, SpecIcon,
  formatScore, pageKit, roleKits, type Locale,
} from "./LeaderboardParts";
import styles from "./leaderboard.module.css";
import { JsonLd } from "@/lib/seo/jsonld";
import { leaderboardLd } from "@/lib/seo/itemLists";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } satisfies Record<LeaderboardRole, unknown>;
type Params = Record<string, string | string[] | undefined>;

/** /wow/mythic-plus/leaderboard: leaders by role, the ranked list with filters, every specialization's board. */
export async function MythicLeaderboardPage({ locale, searchParams }: { locale: Locale; searchParams: Promise<Params> }) {
  const copy = leaderboardCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const action = `${prefix}/wow/mythic-plus/leaderboard`;
  const query = parseLeaderboardQuery(await searchParams);
  const [result, stats] = await Promise.all([loadMythicPlusLeaderboard(query), loadMythicPlusStats({ region: query.region })]);
  const cutoffs = stats.state === "ready" ? stats.data.cutoffs[query.region] : undefined;
  const crumbs = trail(locale, "mythicPlusLeaderboard");
  const page = result.state === "ready" ? result.page : null;
  const eyebrow = page ? copy.eyebrow(page.season.name, copy.regions[page.region]) : copy.regions[query.region];

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      {page?.entries.length ? <JsonLd data={leaderboardLd(crumbs[crumbs.length - 1].label, page.entries, locale)} /> : null}
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
          actions={page ? (
            <div className={styles.actions} data-hub-actions>
              <MaterialLinkButton kit={pageKit} fit="stack" href="#list" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.toList}</MaterialLinkButton>
              <MaterialLinkButton kit="kings-rest" fit="stack" href="#specs" icon={<LayoutGrid aria-hidden="true" />}>{copy.toSpecs}</MaterialLinkButton>
            </div>
          ) : undefined}
        />
        <RegionSwitch current={query.region} copy={copy} href={(region) => `${action}${leaderboardSearch({ ...query, region, realm: undefined, page: undefined })}`} />
        <HeroFacts page={page} cutoffs={cutoffs} locale={locale} />
      </div>

      {!page ? (
        <>
          <MaterialPlaque kit={pageKit} className={styles.statePlaque}>
            <LeaderboardState state={result.state === "error" ? "error" : "empty"} copy={copy} />
          </MaterialPlaque>
          <div className={styles.stateActions}>
            <MaterialLinkButton kit={pageKit} fit="stack" href={`${prefix}/wow/mythic-plus/stats${query.region !== "eu" ? `?region=${query.region}` : ""}#cutoffs`} icon={<ChartNoAxesColumn aria-hidden="true" />}>{copy.toStats}</MaterialLinkButton>
            <MaterialLinkButton kit="den-of-nalorakk" fit="stack" href={`${prefix}/wow/mythic-plus/comps`} icon={<Users aria-hidden="true" />}>{copy.toComps}</MaterialLinkButton>
          </div>
        </>
      ) : (
        <>
          {page.status === "stale" ? <AtlasNotice tone="caution">{copy.stale}</AtlasNotice> : null}
          {page.leaders ? <div data-hub-reveal><Leaders page={page} locale={locale} copy={copy} /></div> : null}
          <div data-hub-reveal>
            <AtlasSection id="list" className={styles.section} title={page.depth < 500 || query.role || query.classId || query.specId ? copy.listTitleFiltered(page.depth) : copy.listTitle}>
              <MaterialPlaque kit={pageKit} className={styles.tablePlaque}>
                <LeaderboardFilters page={page} query={query} action={action} locale={locale} copy={copy} />
                <LeaderboardTable page={page} locale={locale} copy={copy} prefix={prefix} />
                <LeaderboardPager page={page} query={query} action={action} copy={copy} />
              </MaterialPlaque>
            </AtlasSection>
          </div>
          <div data-hub-reveal>
            <AtlasSection id="specs" className={styles.section} title={copy.specsTitle}>
              <SpecDirectory region={query.region} locale={locale} copy={copy} prefix={prefix} />
            </AtlasSection>
          </div>
        </>
      )}
    </AtlasFrame>
  );
}

/** Rating that makes the region's top 0.1% and 1%, and the leader's rating: the numbers a player measures against. */
function HeroFacts({ page, cutoffs, locale }: { page: LeaderboardPage | null; cutoffs: RegionCutoffs | undefined; locale: Locale }) {
  const copy = leaderboardCopy[locale];
  const tier = (key: string) => cutoffs?.tiers.find((item) => item.key === key);
  const leader = page?.entries[0]?.rank === 1 ? page.entries[0] : undefined;
  const items = [
    ...(leader ? [{ value: formatScore(leader.score, locale), label: copy.leaderRating }] : []),
    ...(tier("p999") ? [{ value: Math.round(tier("p999")!.score).toLocaleString(locale), label: copy.top01 }] : []),
    ...(tier("p990") ? [{ value: Math.round(tier("p990")!.score).toLocaleString(locale), label: copy.top1 }] : []),
  ];
  return items.length ? <div className={styles.heroFacts}><AtlasStats items={items} /></div> : null;
}

function Leaders({ page, locale, copy }: { page: LeaderboardPage; locale: Locale; copy: LeaderboardCopy }) {
  return (
    <AtlasSection id="leaders" className={styles.section} title={copy.leadersTitle}>
      <div className={styles.podium}>
        {leaderboardRoles.map((role) => {
          const Icon = roleIcons[role];
          const [leader, ...rest] = page.leaders?.[role] ?? [];
          const leaderSpec = leader ? leaderboardSpec(leader.specId) : null;
          return (
            <MaterialPlaque key={role} as="section" kit={roleKits[role]} className={styles.rolePlaque} aria-labelledby={`leaders-${role}`}>
              <h3 id={`leaders-${role}`} className={styles.roleTitle}><Icon aria-hidden="true" />{copy.roles[role]}</h3>
              <ol className={styles.podiumList}>
                {leader && leaderSpec ? (
                  <li className={styles.leader} style={{ "--class-color": leaderSpec.color } as CSSProperties}>
                    <span className={styles.podiumRank}>1</span>
                    <span className={styles.podiumWho}><SpecIcon spec={leaderSpec} size={56} /><PlayerName entry={leader} locale={locale} profile={page.region} /></span>
                    <b className={styles.leaderScore}>{formatScore(leader.score, locale)}</b>
                  </li>
                ) : null}
                {rest.map((entry) => {
                  const spec = leaderboardSpec(entry.specId);
                  return spec ? (
                    <li key={`${entry.realm.slug}:${entry.name}`} className={styles.podiumItem}>
                      <span className={styles.podiumRank}>{entry.rank}</span>
                      <span className={styles.podiumWho}><SpecIcon spec={spec} size={36} /><PlayerName entry={entry} locale={locale} profile={page.region} /></span>
                      <b className={styles.podiumScore}>{formatScore(entry.score, locale)}</b>
                    </li>
                  ) : null;
                })}
              </ol>
              <MythicHubOrnaments slug={roleKits[role]} />
            </MaterialPlaque>
          );
        })}
      </div>
    </AtlasSection>
  );
}
