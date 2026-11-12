import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Clapperboard, Users } from "lucide-react";
import { AtlasField, AtlasFrame, AtlasHero, AtlasSection, AtlasSelect } from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, MythicHubMotion } from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections, dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import { runHref } from "@/lib/games/wow/mythicPlusRunTypes";
import { loadMythicPlusRuns } from "@/lib/games/wow/mythicPlusRuns";
import { clock, runsRoles, runsSorts, withSpec, withoutSpec, type RunsQuery, type RunsResponse, type RunsRole } from "@/lib/games/wow/mythicPlusRunsTypes";
import { trail, trailLabel } from "@/lib/routes/registry";
import { dungeonLabel, DungeonStrip, FilterForm, GroupIcons, isSeasonDungeon, hrefWith, LoadState, NoMatch, number, percent, roleIcons, SelectedSpec, specIndex, specLabel, SpecToken, StaleNotice, type Locale } from "./CommunityParts";
import { communityCopy, type CommunityCopy } from "./communityCopy";
import styles from "./community.module.css";

const kit = "temple-of-sethraliss" as const;
const pageSize = 30;
const roleSize: Record<RunsRole, number> = { tank: 1, healer: 1, dps: 3 };

/** /wow/mythic-plus/routes: top timed runs of groups like yours, each linked to its run page. */
export async function RoutesPage({ locale, query }: { locale: Locale; query: RunsQuery }) {
  const copy = communityCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const base = `${prefix}/wow/mythic-plus/routes`;
  const result = await loadMythicPlusRuns(query);
  const data = result.state === "ready" ? result.data : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.routes.breadcrumb });
  const stats = data ? [
    { value: number(data.sample.runs, locale), label: copy.routes.found(data.sample.runs, "").trim() },
    ...(data.sample.runs ? [{ value: `+${data.sample.maxLevel}`, label: copy.highestKey.toLowerCase() }] : []),
  ] : [];
  const sortField = (
    <AtlasField label={copy.routes.sort} htmlFor="routes-filters-sort">
      <AtlasSelect id="routes-filters-sort" name="sort" defaultValue={query.sort ?? "level"}>
        {runsSorts.map((sort) => <option key={sort} value={sort}>{copy.routes.sorts[sort]}</option>)}
      </AtlasSelect>
    </AtlasField>
  );

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbsLabel={trailLabel(locale)} breadcrumbs={crumbs}
          title={copy.routes.title}
          lede={copy.routes.lede}
          actions={<div className={styles.actions} data-hub-actions>
            <MaterialLinkButton kit="den-of-nalorakk" href={hrefWith(`${prefix}/wow/mythic-plus/comps`, { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel, specs: query.specs })} fit="stack" icon={<Users aria-hidden="true" />}>{copy.routes.toComps}</MaterialLinkButton>
          </div>}
        />
        {stats.length ? <div className={styles.heroFacts}><AtlasStats items={stats} /></div> : null}
      </div>
      {data ? <StaleNotice data={data} copy={copy} /> : null}
      {data ? <DungeonStrip data={data} query={query} base={base} copy={copy} locale={locale} label={copy.dungeon} /> : null}
      <FilterForm id="routes-filters" kit={kit} data={data} query={query} copy={copy} action={base} fields={data ? ["region", "minLevel"] : ["dungeon", "region", "minLevel"]} extra={sortField} locale={locale} />
      {!data ? <LoadState result={result} kit={kit} copy={copy} resetHref={base} /> : (
        <>
          <SpecPicker data={data} query={query} copy={copy} base={base} locale={locale} />
          <div data-hub-reveal><Results data={data} query={query} copy={copy} locale={locale} base={base} /></div>
        </>
      )}
    </AtlasFrame>
  );
}

type Ctx = { data: RunsResponse; query: RunsQuery; copy: CommunityCopy; base: string; locale: Locale };

/** Your specs: chosen ones (links that remove them) and every spec of a role that still has room (links that add it). */
function SpecPicker({ data, query, copy, base, locale }: Ctx) {
  const specs = specIndex(data.specs, locale);
  const order: Record<RunsRole, number> = { tank: 0, healer: 1, dps: 2 };
  const chosen = [...(query.specs ?? [])].sort((a, b) => order[specs.get(a)?.role ?? "dps"] - order[specs.get(b)?.role ?? "dps"]);
  const count = (role: RunsRole) => chosen.filter((id) => specs.get(id)?.role === role).length;
  return (
    <MaterialPlaque kit={kit} as="section" className={styles.picker} aria-labelledby="routes-specs">
      <h2 id="routes-specs" className={styles.pickerTitle}>{copy.routes.specsLabel}</h2>
      {chosen.length ? (
        <ul className={styles.chosenList}>
          {chosen.map((id, index) => <li key={`${id}-${index}`}><SelectedSpec spec={specs.get(id)} href={hrefWith(base, withoutSpec(query, id))} copy={copy} /></li>)}
        </ul>
      ) : null}
      <div className={styles.pickerRoles}>
        {runsRoles.filter((role) => count(role) < roleSize[role]).map((role) => {
          const Icon = roleIcons[role];
          const list = [...specs.values()].filter((spec) => spec.role === role).sort((a, b) => a.className.localeCompare(b.className) || a.specName.localeCompare(b.specName));
          return (
            <section key={role} className={styles.pickerRole} data-role={role} aria-labelledby={`pick-${role}`}>
              <h3 id={`pick-${role}`} className={styles.roleTitle}><Icon aria-hidden="true" />{copy.rolesPlural[role]}</h3>
              <ul className={styles.pickList}>
                {list.map((spec) => (
                  <li key={spec.id}>
                    <a className={styles.pick} href={hrefWith(base, withSpec(query, spec.id))} aria-label={copy.add(specLabel(spec))} title={specLabel(spec)}>
                      <SpecToken spec={spec} size="md" name={false} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </MaterialPlaque>
  );
}

function Results({ data, query, copy, locale, base }: Ctx) {
  const specs = specIndex(data.specs, locale);
  const prefix = locale === "ru" ? "/ru" : "";
  const names = new Map(data.dungeons.map((dungeon) => [dungeon.slug, dungeonLabel(dungeon.slug, dungeon.name, locale)]));
  const date = new Intl.DateTimeFormat(copy.dateLocale, { day: "numeric", month: "short", timeZone: "UTC" });
  const limit = query.limit ?? pageSize;
  const more = data.runs.length < data.sample.runs && limit < 100;
  return (
    <AtlasSection
      id="runs"
      className={styles.section}
      title={copy.routes.resultsTitle}
      aside={query.dungeon ? <a className={styles.inlineLink} href={`https://keystone.guru/routes/retail/${query.dungeon}`} rel="noreferrer" target="_blank">{copy.routes.guru}<ArrowUpRight aria-hidden="true" /></a> : undefined}
    >
      <MaterialPlaque kit="kings-rest" className={styles.tablePlaque}>
        {data.runs.length ? (
          <ol className={styles.runs}>
            {data.runs.map((run) => {
              const season = isSeasonDungeon(run.dungeon) ? run.dungeon : null;
              const name = names.get(run.dungeon) ?? { name: run.dungeon, lang: "en" };
              return (
                <li key={run.id} style={{ "--dungeon-accent": season ? dungeonArtDirections[season].accent : undefined, "--run-used": `${Math.min(100, (run.clearMs / run.timerMs) * 100)}%` } as CSSProperties}>
                  <a className={styles.run} href={runHref(prefix, run.id)}>
                    <span className={styles.runArt} aria-hidden="true">
                      {season ? <Image src={dungeonBackdropSmall(season)} alt="" fill sizes="112px" /> : null}
                    </span>
                    <span className={styles.runKey}>
                      <b>+{run.level}</b>
                      <span aria-label={copy.routes.upgrades(run.chests)}>{"★".repeat(run.chests)}</span>
                    </span>
                    <span className={styles.runMain}>
                      <span className={styles.runDungeon} lang={name.lang}>{name.name}</span>
                      <span className={styles.runClock} aria-hidden="true"><span /></span>
                      <span className={styles.runMeta}>
                        <span><b>{clock(run.clearMs)}</b> / {clock(run.timerMs)}</span>
                        <span>{copy.timeLeft.toLowerCase()} {percent(run.timeLeft, locale)}</span>
                        <span>{copy.regionsShort[run.region] ?? run.region.toUpperCase()}</span>
                        <time dateTime={run.completedAt}>{date.format(new Date(run.completedAt))}</time>
                        {run.video ? <span className={styles.videoMark} title={copy.routes.video}><Clapperboard aria-hidden="true" /><span className={styles.srOnly}>{copy.routes.video}</span></span> : null}
                      </span>
                    </span>
                    <GroupIcons group={run.group} specs={specs} />
                    <ArrowRight className={styles.runArrow} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ol>
        ) : <NoMatch copy={copy} resetHref={base} />}
        {more ? (
          <p className={styles.more}>
            <a className={styles.inlineLink} href={`${hrefWith(base, { ...query, limit: Math.min(100, limit + pageSize) })}#runs`}>{copy.routes.more}</a>
          </p>
        ) : null}
      </MaterialPlaque>
    </AtlasSection>
  );
}
