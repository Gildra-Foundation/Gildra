import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { CharacterEquipment } from "./CharacterEquipment";
import { MaterialLinkButton, MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { defaultTalentSpecTheme, getTalentSpecThemeById } from "@/lib/talentSpecThemes";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import { dungeonArtDirections, dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import { dungeonRoutes } from "@/lib/data/wow/mythic/dungeonRoutes";
import { wowSourceName, wowSourceNameLang } from "@/lib/wow/sourceLocale";
import { runHref } from "@/lib/games/wow/mythicPlusRunTypes";
import { clock } from "@/lib/games/wow/mythicPlusRunsTypes";
import { leaderboardSearch, talentsUrl, leaderboardSpec } from "@/lib/games/wow/mplusLeaderboardView";
import { trail } from "@/lib/routes/registry";
import type { PlayerProfile } from "@/lib/wow/playerProfile";
import { playerProfilePath, type PlayerBestRun, type PlayerKey, type PlayerRaid } from "@/lib/wow/playerProfileView";
import auditStyles from "./characterProfile.module.css";
import { PlayerTalents } from "./PlayerTalents";
import { playerProfileCopy, type PlayerProfileCopy } from "./playerProfileCopy";
import styles from "./playerProfile.module.css";

type Locale = "en" | "ru";
const numberLocale = { en: "en-US", ru: "ru-RU" } as const;
const leaderboardHref = (locale: Locale, region: string) => `${locale === "ru" ? "/ru" : ""}/wow/mythic-plus/leaderboard${leaderboardSearch({ region: region as PlayerKey["region"] })}`;

function crumbs(locale: Locale, region: string, label: string) {
  const items = trail(locale, "mythicPlusLeaderboard", { label });
  return items.map((item, index) => index === items.length - 2 ? { ...item, href: leaderboardHref(locale, region) } : item);
}

/** A public character profile (the route puts it in the Characters frame, CharacterProfileFrame): hero, equipment, talents, the season's best keys and raid progress. */
export function PlayerProfilePage({ locale, profile, talentData }: { locale: Locale; profile: PlayerProfile; talentData: TalentCalculatorData | null }) {
  const copy = playerProfileCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const { snapshot, key } = profile;
  const { character } = snapshot;
  const theme = getTalentSpecThemeById(profile.specId) ?? defaultTalentSpecTheme;
  const spec = leaderboardSpec(profile.specId);
  const loadout = snapshot.activeTalentLoadout;
  const facts = [
    { value: character.itemLevel.toLocaleString(numberLocale[locale]), label: copy.itemLevel },
    ...profile.rating ? [{ value: <span className={styles.rating} style={{ "--rating-color": profile.rating.color } as CSSProperties}>{Math.round(profile.rating.value).toLocaleString(numberLocale[locale])}</span>, label: copy.rating }] : [],
  ];
  return (
    <div
      className={`${auditStyles.page} ${styles.page}`}
      data-character-atlas
      data-player-profile
      style={{
        "--spec-accent": theme.accent, "--spec-hot": theme.hot, "--spec-deep": theme.deep, "--spec-rgb": theme.accentRgb, "--spec-hot-rgb": theme.hotRgb, "--spec-ambient-rgb": theme.ambientRgb,
        "--tc-accent": theme.accent, "--tc-hot": theme.hot, "--tc-deep": theme.deep, "--tc-accent-rgb": theme.accentRgb, "--tc-hot-rgb": theme.hotRgb, "--tc-ambient-rgb": theme.ambientRgb,
        "--class-color": spec?.color,
      } as CSSProperties}
    >
      <div className={auditStyles.heroBlock} data-character-identity>
        <AtlasHero
          align="start"
          className={`${auditStyles.hero} ${styles.hero}`}
          breadcrumbs={crumbs(locale, key.region, character.name)}
          breadcrumbsLabel={copy.breadcrumbs}
          emblem={<img src={snapshot.media?.avatar ?? snapshot.specialization.iconUrl} alt="" decoding="async" />}
          eyebrow={character.className}
          title={character.name}
          lede={[`${copy.level} ${character.level}`, character.race, `${profile.realmName} (${key.region.toUpperCase()})`, profile.guild ? `‹${profile.guild}›` : ""].filter(Boolean).join(" · ")}
          actions={(
            <p className={styles.links}>
              <a href={profile.armoryUrl} target="_blank" rel="noreferrer">{copy.armory}<ArrowUpRight aria-hidden="true" /></a>
              <a href={`https://raider.io/characters/${key.region}/${encodeURIComponent(key.realm)}/${encodeURIComponent(character.name)}`} target="_blank" rel="noreferrer">{copy.raiderIo}<ArrowUpRight aria-hidden="true" /></a>
            </p>
          )}
        />
        <AtlasStats className={auditStyles.facts} label={copy.summary} items={facts} />
      </div>

      <CharacterEquipment snapshot={snapshot} lang={locale} modelItemsUrl={`/api${playerProfilePath(key.region, key.realm, key.name)}/model-items`} />

      {talentData && loadout ? (
        <PlayerTalents
          data={talentData}
          specSlug={theme.slug}
          loadout={loadout}
          calculatorHref={spec ? talentsUrl(spec, loadout, profile.heroTreeId, prefix) : `${prefix}/talents/${theme.slug}?import=${encodeURIComponent(loadout)}`}
          localePrefix={prefix}
          copy={{ talents: copy.talents, copyBuild: copy.copyBuild, copied: copy.copied, openCalculator: copy.openCalculator }}
        />
      ) : null}

      {profile.runs.length ? <BestRuns runs={profile.runs} locale={locale} copy={copy} /> : null}
      {profile.raids.length ? <RaidProgress raids={profile.raids} locale={locale} copy={copy} /> : null}
    </div>
  );
}

function dungeonName(run: PlayerBestRun, locale: Locale) {
  const route = run.slug ? dungeonRoutes[run.slug] : undefined;
  const source = route?.name ?? run.name;
  return { name: route ? wowSourceName(source, locale, route.nameRu) : run.name, lang: route ? wowSourceNameLang(source, locale, route.nameRu) : locale };
}

function BestRuns({ runs, locale, copy }: { runs: PlayerBestRun[]; locale: Locale; copy: PlayerProfileCopy }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const date = new Intl.DateTimeFormat(numberLocale[locale], { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <AtlasSection id="mythic-plus" title={copy.mythicPlus} className={styles.section}>
      <MaterialPlaque kit={CHARACTERS_KIT} className={styles.plaque}>
        <ol className={styles.runs}>
          {runs.map((run) => {
            const name = dungeonName(run, locale);
            const used = run.timerMs ? Math.min(100, (run.durationMs / run.timerMs) * 100) : undefined;
            const body = <>
              <span className={styles.runArt} aria-hidden="true">
                {run.slug ? <Image src={dungeonBackdropSmall(run.slug)} alt="" fill sizes="112px" /> : null}
              </span>
              <span className={styles.runKey}>
                <b>+{run.level}</b>
                <span aria-label={copy.upgrades(run.upgrades)} data-depleted={run.upgrades === 0 || undefined}>{run.upgrades ? "★".repeat(run.upgrades) : copy.depleted}</span>
              </span>
              <span className={styles.runMain}>
                <span className={styles.runDungeon} lang={name.lang}>{name.name}</span>
                {used !== undefined ? <span className={styles.runClock} data-depleted={!run.timed || undefined} aria-hidden="true"><span style={{ inlineSize: `${used}%` }} /></span> : null}
                <span className={styles.runMeta}>
                  <span><b>{clock(run.durationMs)}</b>{run.timerMs ? ` / ${clock(run.timerMs)}` : ""}</span>
                  {run.completedAt ? <time dateTime={new Date(run.completedAt).toISOString()}>{date.format(new Date(run.completedAt))}</time> : null}
                </span>
              </span>
              <span className={styles.runScore} style={{ "--rating-color": run.color } as CSSProperties}>
                <b>{run.rating.toLocaleString(numberLocale[locale], { maximumFractionDigits: 0 })}</b>
                <span>{copy.points}</span>
              </span>
              {run.runId ? <ArrowRight className={styles.runArrow} aria-hidden="true" /> : <span aria-hidden="true" />}
            </>;
            return (
              <li key={run.dungeonId} style={{ "--dungeon-accent": run.slug ? dungeonArtDirections[run.slug].accent : undefined } as CSSProperties}>
                {run.runId
                  ? <a className={styles.run} href={runHref(prefix, run.runId)} aria-label={copy.openRun(name.name, run.level)}>{body}</a>
                  : <div className={styles.run}>{body}</div>}
              </li>
            );
          })}
        </ol>
      </MaterialPlaque>
    </AtlasSection>
  );
}

function RaidProgress({ raids, locale, copy }: { raids: PlayerRaid[]; locale: Locale; copy: PlayerProfileCopy }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasSection id="raids" title={copy.raids} className={styles.section}>
      <MaterialPlaque kit={CHARACTERS_KIT} className={styles.plaque}>
        <ul className={styles.raids}>
          {raids.map((raid) => (
            <li key={raid.id} className={styles.raid}>
              {raid.slug
                ? <a className={styles.raidName} href={`${prefix}/wow/raids/${raid.slug}`} lang={wowSourceNameLang(raid.name, locale)}>{wowSourceName(raid.name, locale)}</a>
                : <span className={styles.raidName} lang={wowSourceNameLang(raid.name, locale)}>{wowSourceName(raid.name, locale)}</span>}
              <ul className={styles.modes}>
                {raid.modes.map((mode) => (
                  <li key={mode.difficulty} className={styles.mode} data-difficulty={mode.difficulty.toLowerCase()} data-complete={mode.killed >= mode.total || undefined}>
                    <span className={styles.modeLabel} title={copy.difficulty[mode.difficulty]}><abbr title={copy.difficulty[mode.difficulty]}>{copy.difficultyShort[mode.difficulty]}</abbr></span>
                    <span className={styles.modeBar} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, (mode.killed / mode.total) * 100)}%` }} /></span>
                    <b className={styles.modeCount}>{mode.killed}/{mode.total}</b>
                    <span className={styles.srOnly}>{copy.difficulty[mode.difficulty]}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </MaterialPlaque>
    </AtlasSection>
  );
}

/** Blizzard did not answer (or the per-minute budget is spent): the same frame, a short state and a retry. */
export function PlayerProfileUnavailable({ locale, playerKey }: { locale: Locale; playerKey: PlayerKey }) {
  const copy = playerProfileCopy[locale];
  const { region } = playerKey;
  const retryHref = playerProfilePath(region, playerKey.realm, playerKey.name, locale === "ru" ? "/ru" : "");
  return (
    <div className={`${auditStyles.page} ${styles.page}`} data-player-profile="unavailable">
      <div className={auditStyles.heroBlock}>
        <AtlasHero
          align="start"
          className={auditStyles.hero}
          breadcrumbs={crumbs(locale, region, copy.unavailableTitle).slice(0, -1)}
          breadcrumbsLabel={copy.breadcrumbs}
          title={copy.unavailableTitle}
          lede={copy.unavailable}
          actions={<div className={styles.talentActions}>
            <MaterialLinkButton kit={CHARACTERS_KIT} variant="primary" fit="stack" href={retryHref} prefetch={false} icon={<RefreshCw aria-hidden="true" />}>{copy.retry}</MaterialLinkButton>
            <MaterialLinkButton kit={CHARACTERS_KIT} fit="stack" href={leaderboardHref(locale, region)} icon={<ArrowLeft aria-hidden="true" />}>{copy.back}</MaterialLinkButton>
          </div>}
        />
      </div>
    </div>
  );
}
