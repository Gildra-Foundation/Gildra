import type { CSSProperties } from "react";
import { ArrowRight, Route, Users } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, MythicHubMotion } from "@/components/wow/shared/materialAtlas";
import { loadMythicPlusComps } from "@/lib/games/wow/mythicPlusRuns";
import { runsRoles, withSpec, withoutSpec, type CompsResponse, type RunsQuery, type RunsRole } from "@/lib/games/wow/mythicPlusRunsTypes";
import { trail } from "@/lib/routes/registry";
import { DungeonStrip, FilterForm, GroupIcons, hrefWith, LoadState, NoMatch, number, percent, shareOf, roleIcons, SelectedSpec, SourceLine, specIndex, specLabel, SpecToken, StaleNotice, type Locale, type SpecView } from "./CommunityParts";
import { communityCopy, type CommunityCopy } from "./communityCopy";
import styles from "./community.module.css";

const kit = "den-of-nalorakk" as const;
const tableKit = "kings-rest" as const;
const topRows = 20;

/** /wow/mythic-plus/comps: build a group from the top runs, the most played exact groups and the pairs that team up. */
export async function CompsPage({ locale, query }: { locale: Locale; query: RunsQuery }) {
  const copy = communityCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const base = `${prefix}/wow/mythic-plus/comps`;
  const result = await loadMythicPlusComps(query);
  const data = result.state === "ready" ? result.data : null;
  const crumbs = trail(locale, "mythicPlus", { label: copy.comps.breadcrumb });
  const stats = data ? [
    { value: number(data.sample.runs, locale), label: copy.runsCount(data.sample.runs, "").trim() },
    { value: data.sample.runs ? `+${data.sample.minLevel}–${data.sample.maxLevel}` : "—", label: copy.keyRange },
  ] : [];

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <MythicHubMotion />
      <div className={styles.hero} data-hub-hero>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          title={copy.comps.title}
          lede={copy.comps.lede}
          actions={<div className={styles.actions} data-hub-actions>
            <MaterialLinkButton kit={kit} href="#fill" variant="primary" fit="stack" icon={<Users aria-hidden="true" />}>{copy.comps.fillTitle}</MaterialLinkButton>
            <MaterialLinkButton kit="temple-of-sethraliss" href={hrefWith(`${prefix}/wow/mythic-plus/routes`, { dungeon: query.dungeon, specs: query.specs })} fit="stack" icon={<Route aria-hidden="true" />}>{copy.comps.toRoutes}</MaterialLinkButton>
          </div>}
        />
        {stats.length ? <div className={styles.heroFacts}><AtlasStats items={stats} /></div> : null}
      </div>
      {data ? <StaleNotice data={data} copy={copy} /> : null}
      {data ? <DungeonStrip data={data} query={query} base={base} copy={copy} locale={locale} label={copy.dungeon} /> : null}
      <FilterForm id="comps-filters" kit={kit} data={data} query={query} copy={copy} action={base} fields={data ? ["region", "minLevel"] : ["dungeon", "region", "minLevel"]} locale={locale} />
      {!data ? <LoadState result={result} kit={kit} copy={copy} resetHref={base} /> : (
        <>
          <div data-hub-reveal><Fill data={data} query={query} copy={copy} locale={locale} base={base} prefix={prefix} /></div>
          <div data-hub-reveal><TopCompositions data={data} query={query} copy={copy} locale={locale} base={base} prefix={prefix} /></div>
          {data.pairs.length ? <div data-hub-reveal><Pairs data={data} copy={copy} locale={locale} /></div> : null}
        </>
      )}
      <SourceLine copy={copy} hubHref={`${prefix}/wow/mythic-plus`} kit={kit} />
    </AtlasFrame>
  );
}

type Ctx = { data: CompsResponse; query: RunsQuery; copy: CommunityCopy; locale: Locale; base: string; prefix: string };

function Fill({ data, query, copy, locale, base, prefix }: Ctx) {
  const specs = specIndex(data.specs, locale);
  const chosen = data.fill.selected;
  const byRole = (role: RunsRole) => chosen.filter((id) => specs.get(id)?.role === role);
  const slots: Array<{ role: RunsRole; spec?: number }> = runsRoles.flatMap((role) => {
    const have = byRole(role);
    const size = role === "dps" ? 3 : 1;
    return Array.from({ length: size }, (_, index) => ({ role, spec: have[index] }));
  });
  const open = runsRoles.filter((role) => data.fill.open[role] > 0);
  return (
    <AtlasSection id="fill" className={styles.section} title={copy.comps.fillTitle} description={copy.comps.fillText}>
      <MaterialPlaque kit={kit} className={styles.fillPlaque}>
        <ol className={styles.slots} aria-label={copy.comps.fillTitle}>
          {slots.map((slot, index) => {
            const Icon = roleIcons[slot.role];
            return (
              <li key={`${slot.role}-${index}`} className={styles.slot} data-filled={slot.spec ? "" : undefined}>
                {slot.spec
                  ? <SelectedSpec spec={specs.get(slot.spec)} href={hrefWith(base, withoutSpec(query, slot.spec))} copy={copy} />
                  : <span className={styles.emptySlot}><Icon aria-hidden="true" /><span className={styles.slotRole}>{copy.roles[slot.role]}</span><span className={styles.srOnly}>{copy.emptySlot(copy.roles[slot.role])}</span></span>}
              </li>
            );
          })}
        </ol>
        <p className={styles.fillSummary}>
          {chosen.length ? (data.fill.matched ? copy.comps.matched(data.fill.matched, number(data.fill.matched, locale)) : copy.comps.noneMatched) : null}
          {chosen.length && data.fill.matched ? (
            <a className={styles.inlineLink} href={hrefWith(`${prefix}/wow/mythic-plus/routes`, { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel, specs: query.specs })}>
              {copy.comps.findRuns}<ArrowRight aria-hidden="true" />
            </a>
          ) : null}
        </p>
        {open.length ? (
          <div className={styles.candidateRoles}>
            {open.map((role) => <CandidateList key={role} role={role} data={data} query={query} copy={copy} locale={locale} base={base} specs={specs} />)}
          </div>
        ) : <p className={styles.fillSummary}>{copy.comps.groupFull}</p>}
      </MaterialPlaque>
    </AtlasSection>
  );
}

function CandidateList({ role, data, query, copy, locale, base, specs }: Omit<Ctx, "prefix"> & { role: RunsRole; specs: Map<number, SpecView> }) {
  const Icon = roleIcons[role];
  const list = data.fill.candidates[role] ?? [];
  if (!list.length) return null;
  const top = Math.max(...list.map((item) => item.share), 1);
  return (
    <section className={styles.candidates} aria-labelledby={`add-${role}`}>
      <h3 id={`add-${role}`} className={styles.roleTitle}><Icon aria-hidden="true" />{copy.comps.suggestions(copy.roles[role])}</h3>
      <ol className={styles.candidateList}>
        {list.map((item) => {
          const spec = specs.get(item.spec);
          return (
            <li key={item.spec}>
              <a className={styles.candidate} href={hrefWith(base, withSpec(query, item.spec))} aria-label={`${copy.add(specLabel(spec))}: ${percent(item.share, locale)}, ${copy.runsCount(item.runs, number(item.runs, locale))}`}>
                <SpecToken spec={spec} size="sm" />
                <span className={styles.candidateBar} aria-hidden="true"><span style={{ inlineSize: `${(item.share / top) * 100}%`, "--bar-color": spec?.color } as CSSProperties} /></span>
                <b className={styles.candidateShare}>{shareOf(item.share, item.runs, locale)}</b>
                <span className={styles.candidateRuns}>{number(item.runs, locale)}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TopCompositions({ data, query, copy, locale, prefix }: Ctx) {
  const topShare = Math.max(1, ...data.compositions.slice(0, topRows).map((row) => row.share));
  const specs = specIndex(data.specs, locale);
  const rows = data.compositions.slice(0, topRows);
  return (
    <AtlasSection id="top" className={styles.section} title={copy.comps.topTitle} description={copy.comps.topText}>
      <MaterialPlaque kit={tableKit} className={styles.tablePlaque}>
        {rows.length ? (
          <>
            <div className={styles.compHead} aria-hidden="true">
              <span>#</span><span>{copy.comps.group}</span>
              <span>{copy.comps.openRuns}</span><span>{copy.highestKey}</span><span>{copy.medianKey}</span><span>{copy.timeLeft}</span><span />
            </div>
            <ol className={styles.comps}>
              {rows.map((row, index) => (
                <li key={`${row.tank}-${row.healer}-${row.dps.join("-")}`} className={styles.comp} data-rank={index < 3 ? index + 1 : undefined}>
                  <span className={styles.compRank}>{index + 1}</span>
                  <GroupIcons group={row} specs={specs} size="md" />
                  <dl className={styles.compStats}>
                    <div className={styles.compShare}><dt>{copy.comps.openRuns}</dt><dd><span className={styles.meter} aria-hidden="true"><span style={{ inlineSize: `${(row.share / topShare) * 100}%` }} /></span><b>{number(row.runs, locale)}</b> <span>{percent(row.share, locale)}</span></dd></div>
                    <div><dt>{copy.highestKey}</dt><dd>+{row.maxLevel}</dd></div>
                    <div><dt>{copy.medianKey}</dt><dd>+{number(row.medianLevel, locale, 1)}</dd></div>
                    <div><dt>{copy.timeLeft}</dt><dd>{percent(row.medianTimeLeft, locale)}</dd></div>
                  </dl>
                  <a className={styles.rowLink} href={hrefWith(`${prefix}/wow/mythic-plus/routes`, { dungeon: query.dungeon, region: query.region, minLevel: query.minLevel, specs: [row.tank, row.healer, ...row.dps] })}>
                    {copy.comps.openRuns}<ArrowRight aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
          </>
        ) : <NoMatch copy={copy} resetHref={hrefWith(`${prefix}/wow/mythic-plus/comps`, {})} />}
      </MaterialPlaque>
    </AtlasSection>
  );
}

function Pairs({ data, copy, locale }: Omit<Ctx, "query" | "base" | "prefix">) {
  const specs = specIndex(data.specs, locale);
  const topLift = Math.max(1, ...data.pairs.map((pair) => pair.lift));
  return (
    <AtlasSection id="pairs" className={styles.section} title={copy.comps.pairsTitle} description={copy.comps.pairsText}>
      <MaterialPlaque kit="voidscar-arena" className={styles.tablePlaque}>
        <ul className={styles.pairs}>
          {data.pairs.map((pair) => (
            <li key={`${pair.a}-${pair.b}`} className={styles.pair}>
              <span className={styles.pairSpecs}>
                <SpecToken spec={specs.get(pair.a)} size="sm" />
                <SpecToken spec={specs.get(pair.b)} size="sm" />
              </span>
              <span className={styles.pairFacts}>
                <b className={styles.pairLift}>{copy.comps.liftValue(number(pair.lift, locale, 1))}</b>
                <span className={styles.meter} aria-hidden="true"><span style={{ inlineSize: `${(pair.lift / topLift) * 100}%`, "--meter-color": specs.get(pair.a)?.color } as CSSProperties} /></span>
                <span>{copy.runsCount(pair.runs, number(pair.runs, locale))}</span>
              </span>
            </li>
          ))}
        </ul>
      </MaterialPlaque>
    </AtlasSection>
  );
}
