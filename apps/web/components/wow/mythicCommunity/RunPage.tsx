import Image from "next/image";
import { Suspense, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Clapperboard, HeartPulse, Map as MapIcon, Route, Shield, Skull, Sparkles, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { DungeonAtmosphere, MaterialLinkButton, MaterialPlaque, MythicHubBackdrop, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { dungeonArtDirections, dungeonAtmospheres, dungeonCardScene } from "@/lib/wow/dungeonArtDirection";
import { wowSourceName, wowSourceNameLang } from "@/lib/wow/sourceLocale";
import { heroName, leaderboardSpec, talentsUrl } from "@/lib/games/wow/mplusLeaderboardView";
import { clock } from "@/lib/games/wow/mythicPlusRunsTypes";
import { runHref, upgradeMarks, type RunDetail, type RunLoad, type RunPlayer, type RunRole } from "@/lib/games/wow/mythicPlusRunTypes";
import { loadRunReplay, similarLoggedRun, type LoggedRunLink, type ReplayView } from "@/lib/games/wow/mythicPlusRunLog";
import type { ReplayStat } from "@/lib/games/wow/mythicPlusReplayModel";
import { playerProfilePath } from "@/lib/wow/playerProfileView";
import { dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { dungeonMapFrameLayout } from "@/components/wow/shared/dungeonMapFrameLayout";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { MapStill, RunReplay, type ReplayEnemyLabel } from "./RunReplay";
import { trail } from "@/lib/routes/registry";
import timerArtifacts from "../../../public/assets/wow/mythic/hub/controls/timers/manifest.json";
import { dungeonLabel, isSeasonDungeon, number, SourceLine, type Locale } from "./CommunityParts";
import { communityCopy, type CommunityCopy } from "./communityCopy";
import styles from "./run.module.css";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } satisfies Record<RunRole, unknown>;
const fallbackKit: MaterialKit = "temple-of-sethraliss";

/** /wow/mythic-plus/routes/<id>: one top run — the dungeon, the key, the clock against the timer and the five players. */
export function RunPage({ locale, load }: { locale: Locale; load: RunLoad }) {
  const copy = communityCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const finder = `${prefix}/wow/mythic-plus/routes`;
  if (load.state !== "ready") return <Unavailable locale={locale} copy={copy} finder={finder} />;

  const { run } = load;
  const slug = run.dungeon.slug;
  const season = isSeasonDungeon(slug) ? slug : null;
  const kit: MaterialKit = season ?? fallbackKit;
  const dungeon = dungeonLabel(slug, run.dungeon.name, locale);
  const region = run.players[0]?.region;
  const date = run.completedAt ? new Intl.DateTimeFormat(copy.dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(run.completedAt)) : "";
  const eyebrow = [region ? copy.regions[region] ?? region.toUpperCase() : "", date].filter(Boolean).join(" · ");
  const crumbs = trail(locale, "mythicPlusRoutes", { label: copy.run.title(dungeon.name, run.level) });
  const accent = season ? dungeonArtDirections[season].accent : undefined;

  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      {season ? (
        <div className={styles.backdrop} aria-hidden="true">
          <div className={styles.scene}>
            <Image src={dungeonCardScene(season)} alt="" fill priority sizes="100vw" className={styles.sceneImage} />
            <DungeonAtmosphere kind={dungeonAtmospheres[season]} />
          </div>
        </div>
      ) : <MythicHubBackdrop />}
      <div className={styles.hero} style={{ "--run-accent": accent } as CSSProperties}>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={crumbs}
          eyebrow={eyebrow}
          title={<span lang={dungeon.lang}>{dungeon.name}</span>}
          actions={<div className={styles.actions}>
            {season ? <MaterialLinkButton kit={kit} href={`${prefix}/wow/mythic-plus/midnight-season-2/${season}`} variant="primary" fit="stack" icon={<MapIcon aria-hidden="true" />}>{copy.run.dungeonRoute}</MaterialLinkButton> : null}
            <MaterialLinkButton kit={kit} href={`${finder}?dungeon=${encodeURIComponent(slug)}`} fit="stack" icon={<Route aria-hidden="true" />}>{copy.run.moreRuns}</MaterialLinkButton>
          </div>}
          aside={<KeyPlaque run={run} kit={kit} season={season} copy={copy} locale={locale} />}
        />
        {run.affixes.length ? (
          <ul className={styles.affixes} aria-label={copy.run.affixes}>
            {run.affixes.map((affix) => (
              <li key={affix.slug || affix.name} lang={wowSourceNameLang(affix.name, locale)}>
                {/^[a-z0-9_]+$/.test(affix.icon) ? <img src={`https://render.worldofwarcraft.com/eu/icons/56/${affix.icon}.jpg`} alt="" width={24} height={24} loading="lazy" decoding="async" /> : null}
                {wowSourceName(affix.name, locale)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* The log lookup may take a few seconds the first time: the page streams the plain clock and group meanwhile. */}
      <Suspense fallback={<RunBody run={run} kit={kit} season={season} copy={copy} locale={locale} prefix={prefix} finder={finder} />}>
        <LoggedRunBody run={run} kit={kit} season={season} copy={copy} locale={locale} prefix={prefix} finder={finder} />
      </Suspense>
    </AtlasFrame>
  );
}

type BodyProps = { run: RunDetail; kit: MaterialKit; season: DungeonSlug | null; copy: CommunityCopy; locale: Locale; prefix: string; finder: string };

async function LoggedRunBody(props: BodyProps) {
  const view = await loadRunReplay(props.run);
  const similar = view ? null : await similarLoggedRun(props.run);
  return <RunBody {...props} view={view} similar={similar} />;
}

/** Clock, route, group and the source line. `view` undefined = log not resolved yet, null = the run has no log. */
function RunBody({ run, kit, season, copy, locale, prefix, finder, view, similar }: BodyProps & { view?: ReplayView | null; similar?: LoggedRunLink | null }) {
  const stats = new Map((view?.replay.stats ?? []).map((stat) => [stat.player, stat]));
  return (
    <>
      <RunClock run={run} kit={kit} copy={copy} locale={locale} bar={!view} />
      {view ? <RouteSection run={run} view={view} kit={kit} season={season} copy={copy} locale={locale} />
        : view === null ? <NoLog kit={kit} season={season} copy={copy} prefix={prefix} similar={similar ?? null} /> : null}
      <Group run={run} kit={kit} copy={copy} locale={locale} prefix={prefix} stats={stats} />

      <SourceLine
        copy={copy}
        kit={kit}
        hubHref={finder}
        backLabel={copy.run.toFinder}
        sourceHref={run.url}
        sourceLabel={copy.run.source}
        extra={<>
          {view?.replay.reportUrl ? <a href={view.replay.reportUrl} rel="noreferrer nofollow" target="_blank">{copy.run.log}<ArrowUpRight aria-hidden="true" /></a> : null}
          {season ? <a href={`https://keystone.guru/routes/retail/${season}`} rel="noreferrer" target="_blank">{copy.run.guru}<ArrowUpRight aria-hidden="true" /></a> : null}
        </>}
      />
    </>
  );
}

function RouteSection({ run, view, kit, season, copy, locale }: { run: RunDetail; view: ReplayView; kit: MaterialKit; season: DungeonSlug | null; copy: CommunityCopy; locale: Locale }) {
  const colors = Object.fromEntries(run.players.map((player) => [player.name, leaderboardSpec(player.specId)?.color]));
  const enemies: Record<number, ReplayEnemyLabel> = Object.fromEntries(Object.entries(view.enemies).map(([id, info]) => {
    const ru = locale === "ru" && info.ru;
    return [id, { name: ru ? info.ru! : info.en, ...(ru ? {} : locale === "ru" ? { lang: "en" } : {}), ...(info.portrait ? { portrait: info.portrait } : {}) }];
  }));
  const map = season && view.map ? { image: view.map, frameStyle: dungeonMapFrameLayout(season, dungeonFrameArtwork(season)), markerImage: `/assets/wow/mythic/pull-art/markers/${season}.webp` } : undefined;
  const replay = { ...view.replay, fights: view.replay.fights.map((fight) => ({ ...fight, name: wowSourceName(fight.name, locale) })), pulls: view.replay.pulls.map((pull) => (pull.boss ? { ...pull, boss: wowSourceName(pull.boss, locale) } : pull)),
    deaths: view.replay.deaths.map((death) => (death.ability ? { ...death, ability: { ...death.ability, name: wowSourceName(death.ability.name, locale), lang: wowSourceNameLang(death.ability.name, locale) } } : death)) };
  return (
    <AtlasSection id="route" className={styles.section} title={copy.replay.title}>
      <MaterialPlaque kit={kit} className={styles.routePlaque}>
        <RunReplay locale={locale} replay={replay} map={map} enemies={enemies} colors={colors} timerMs={run.timerMs} clearMs={run.clearMs} />
      </MaterialPlaque>
    </AtlasSection>
  );
}

function NoLog({ kit, season, copy, prefix, similar }: { kit: MaterialKit; season: DungeonSlug | null; copy: CommunityCopy; prefix: string; similar: LoggedRunLink | null }) {
  return (
    <AtlasSection id="route" className={styles.section} title={copy.replay.title}>
      <MaterialPlaque kit={kit} className={season ? styles.noLog : styles.statePlaque}>
        {season ? <MapStill image={`/assets/wow/maps/mdt/${season}.webp`} frameStyle={dungeonMapFrameLayout(season, dungeonFrameArtwork(season))} className={styles.noLogMap} /> : null}
        <div className={styles.noLogText}>
          <p className={styles.stateTitle}>{copy.replay.noLogTitle}</p>
          {similar ? <MaterialLinkButton kit={kit} href={runHref(prefix, similar.id)} fit="stack" icon={<Route aria-hidden="true" />}>{copy.replay.similar(similar.level, clock(similar.clearMs))}</MaterialLinkButton> : null}
        </div>
      </MaterialPlaque>
    </AtlasSection>
  );
}

function KeyPlaque({ run, kit, season, copy, locale }: { run: RunDetail; kit: MaterialKit; season: string | null; copy: CommunityCopy; locale: Locale }) {
  const art = season ? (timerArtifacts.entries as Record<string, { path: string; width: number; height: number }>)[season] : undefined;
  return (
    <MaterialPlaque kit={kit} className={styles.keyPlaque}>
      {art ? <span className={styles.relic} aria-hidden="true"><Image src={art.path} alt="" width={art.width} height={art.height} unoptimized /></span> : null}
      <span className={styles.keyLabel}>{copy.run.key}</span>
      <b className={styles.keyLevel}>+{run.level}</b>
      <span className={styles.chests} aria-hidden="true">
        {[1, 2, 3].map((chest) => <span key={chest} data-on={chest <= run.chests ? "" : undefined}>★</span>)}
      </span>
      <span className={styles.timed} data-timed={run.chests ? "" : undefined}>{copy.run.timed(run.chests)}</span>
      {run.score ? <span className={styles.keyScore}>{copy.run.score}: <b>{number(run.score, locale, 1)}</b></span> : null}
    </MaterialPlaque>
  );
}

/** Clear time against the timer: one bar with the +3/+2/+1 marks and, for logged runs, the boss fights on it. */
function RunClock({ run, kit, copy, locale, bar = true }: { run: RunDetail; kit: MaterialKit; copy: CommunityCopy; locale: Locale; bar?: boolean }) {
  const scale = Math.max(run.timerMs, run.clearMs);
  const at = (ms: number) => `${Math.min(100, (ms / scale) * 100)}%`;
  const delta = run.timerMs - run.clearMs;
  const marks = [...upgradeMarks].map((mark) => ({ label: `+${mark.chests}`, ms: run.timerMs * mark.share })).concat({ label: "+1", ms: run.timerMs });
  const bosses = run.encounters.map((encounter) => ({ ...encounter, label: wowSourceName(encounter.name, locale), lang: wowSourceNameLang(encounter.name, locale) }));
  return (
    <AtlasSection id="clock" className={styles.section} title={copy.run.timerTitle}>
      <MaterialPlaque kit={kit} className={styles.clockPlaque}>
        <dl className={styles.clockFacts}>
          <div className={styles.clockMain}>
            <dt>{copy.run.clear}</dt>
            <dd><time dateTime={`PT${Math.round(run.clearMs / 1000)}S`}>{clock(run.clearMs)}</time></dd>
          </div>
          <div>
            <dt>{copy.run.timer}</dt>
            <dd>{clock(run.timerMs)}</dd>
          </div>
          <div data-tone={delta >= 0 ? "positive" : "negative"}>
            <dt>{delta >= 0 ? copy.timeLeft : copy.run.over}</dt>
            <dd>{delta >= 0 ? "" : "+"}{clock(Math.abs(delta))}</dd>
          </div>
          {run.deaths !== null ? (
            <div>
              <dt><Skull aria-hidden="true" />{copy.run.deaths}</dt>
              <dd>{number(run.deaths, locale)}</dd>
            </div>
          ) : null}
        </dl>
        {bar ? <>
        <div className={styles.bar} role="img" aria-label={`${copy.run.clear} ${clock(run.clearMs)} / ${copy.run.timer} ${clock(run.timerMs)}`}>
          <span className={styles.track}>
            <span className={styles.fill} data-over={delta < 0 ? "" : undefined} style={{ inlineSize: at(run.clearMs) }} />
            {bosses.map((boss, index) => (
              <span key={`${boss.name}-${index}`} className={styles.fight} style={{ insetInlineStart: at(boss.startMs), inlineSize: `calc(${at(boss.endMs)} - ${at(boss.startMs)})` }} />
            ))}
          </span>
          {marks.map((mark) => (
            <span key={mark.label} className={styles.mark} style={{ insetInlineStart: at(mark.ms) }} data-reached={run.clearMs <= mark.ms ? "" : undefined}>
              <span>{mark.label}</span>
            </span>
          ))}
          {bosses.map((boss, index) => (
            <span key={`pin-${boss.name}-${index}`} className={styles.pin} style={{ insetInlineStart: at((boss.startMs + boss.endMs) / 2) }}>{index + 1}</span>
          ))}
        </div>
        <div className={styles.axis} aria-hidden="true"><span>0:00</span><span>{clock(scale)}</span></div>
        </> : null}
        {bosses.length ? (
          <>
            <h3 className={styles.subTitle}>{copy.run.bosses}</h3>
            <ol className={styles.bosses}>
              {bosses.map((boss, index) => (
                <li key={`${boss.name}-${index}`} className={styles.boss}>
                  <span className={styles.bossNumber} aria-hidden="true">{index + 1}</span>
                  <span className={styles.bossName} lang={boss.lang}>{boss.label}</span>
                  <span className={styles.bossTime}>
                    <time dateTime={`PT${Math.round(boss.startMs / 1000)}S`}>{clock(boss.startMs)}</time>–<time dateTime={`PT${Math.round(boss.endMs / 1000)}S`}>{clock(boss.endMs)}</time>
                    <b>{clock(boss.endMs - boss.startMs)}</b>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </MaterialPlaque>
    </AtlasSection>
  );
}

function Group({ run, kit, copy, locale, prefix, stats }: { run: RunDetail; kit: MaterialKit; copy: CommunityCopy; locale: Locale; prefix: string; stats: Map<string, ReplayStat> }) {
  return (
    <AtlasSection id="group" className={styles.section} title={copy.run.groupTitle}>
      <MaterialPlaque kit={kit} className={styles.groupPlaque}>
        <ul className={styles.players}>
          {run.players.map((player) => <PlayerCard key={`${player.name}-${player.realm}`} player={player} copy={copy} locale={locale} prefix={prefix} logged={run.deaths !== null || stats.has(player.name)} stat={stats.get(player.name)} />)}
        </ul>
        {run.videos.length ? (
          <p className={styles.videos}>
            <Clapperboard aria-hidden="true" /><span>{copy.run.videos}:</span>
            {run.videos.map((video) => <a key={video.url} href={video.url} rel="noreferrer" target="_blank">{video.player || video.kind}<ArrowUpRight aria-hidden="true" /></a>)}
          </p>
        ) : null}
      </MaterialPlaque>
    </AtlasSection>
  );
}

function PlayerCard({ player, copy, locale, prefix, logged, stat }: { player: RunPlayer; copy: CommunityCopy; locale: Locale; prefix: string; logged: boolean; stat?: ReplayStat }) {
  const spec = leaderboardSpec(player.specId);
  const Icon = roleIcons[player.role];
  const hero = heroName(spec, player.heroId, locale);
  const specText = spec ? (locale === "ru" ? spec.theme.specNameRu : spec.theme.specName) : "";
  const classText = spec ? (locale === "ru" ? spec.theme.classNameRu : spec.theme.className) : "";
  return (
    <li className={styles.player} style={{ "--class-color": spec?.color } as CSSProperties}>
      <span className={styles.playerRole} title={copy.roles[player.role]}><Icon aria-hidden="true" /><span className={styles.srOnly}>{copy.roles[player.role]}</span></span>
      <span className={styles.playerHead}>
        {spec ? <span className={styles.octagon} aria-hidden="true"><Image src={spec.icon} alt="" width={60} height={60} sizes="60px" /></span> : null}
        <span className={styles.playerWho}>
          {player.realmSlug && player.region ? <a className={styles.playerName} href={playerProfilePath(player.region, player.realmSlug, player.name, prefix === "/ru" ? "/ru" : "")} rel="nofollow">{player.name}</a> : <b className={styles.playerName}>{player.name}</b>}
          <span className={styles.playerRealm}>{player.realm}</span>
        </span>
      </span>
      <span className={styles.playerSpec}>
        <span className={styles.specLine}><b>{specText}</b> {classText}</span>
        {hero ? <span className={styles.heroTree}><Sparkles aria-hidden="true" />{hero}</span> : null}
      </span>
      <dl className={styles.playerFacts}>
        {player.itemLevel ? <div><dt>{copy.run.itemLevel}</dt><dd>{number(player.itemLevel, locale, 1)}</dd></div> : null}
        {player.rating ? <div><dt>{copy.run.rating}</dt><dd>{number(player.rating, locale, 1)}</dd></div> : null}
        {stat?.dps !== undefined && player.role !== "healer" ? <div><dt>{copy.run.dps}</dt><dd>{compact(stat.dps, locale)}</dd></div> : null}
        {stat?.hps !== undefined && player.role === "healer" ? <div><dt>{copy.run.hps}</dt><dd>{compact(stat.hps, locale)}</dd></div> : null}
        {stat?.interrupts !== undefined ? <div><dt>{copy.run.interrupts}</dt><dd>{number(stat.interrupts, locale)}</dd></div> : null}
        {logged ? <div><dt>{copy.run.deaths}</dt><dd>{number(stat?.deaths ?? player.deaths, locale)}</dd></div> : null}
      </dl>
      {spec && player.loadout ? (
        <a className={styles.talents} href={talentsUrl(spec, player.loadout, player.heroId, prefix)} aria-label={copy.run.talentsOf(player.name)}>
          {copy.run.talents}<ArrowRight aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

const compact = (value: number, locale: Locale) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);

function Unavailable({ locale, copy, finder }: { locale: Locale; copy: CommunityCopy; finder: string }) {
  return (
    <AtlasFrame lang={locale} className={styles.page} still foot={false} dataAttributes={{ "data-mythic-hub": true }}>
      <MythicHubBackdrop />
      <div className={styles.hero}>
        <AtlasHero align="start" className={styles.heroHeader} breadcrumbs={trail(locale, "mythicPlusRoutes", { label: copy.run.unavailableTitle })} title={copy.run.unavailableTitle} />
      </div>
      <MaterialPlaque kit={fallbackKit} className={styles.statePlaque}>
        <p className={styles.stateText}>{copy.run.unavailable}</p>
        <MaterialLinkButton kit={fallbackKit} href={finder} fit="stack" icon={<Route aria-hidden="true" />}>{copy.run.toFinder}</MaterialLinkButton>
      </MaterialPlaque>
    </AtlasFrame>
  );
}
