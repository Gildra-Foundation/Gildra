"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronRight, ExternalLink, Search } from "lucide-react";
import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import { AtlasPanel } from "@gildra/atlas-ui/AtlasPanel";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterSlug } from "@/lib/wow/characterSlug";
import { classColors } from "@/lib/atlas/dataPalette";
import { classIcon } from "@/lib/games/wow/assets";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { FrostLoginIcon } from "./FrostLoginIcon";
import { FrostLoginCrest } from "./FrostLoginCrest";
import { characterFrostArt } from "./characterFrostAssets";
import type { RosterCopy } from "./characterCopy";
import styles from "./characterRosterPage.module.css";
import frost from "./characterFrost.module.css";

type RosterError = "expired" | "forbidden" | "rate-limited" | "unavailable";
type RegionResult = { region: BattleNetRegion; characters: BattleNetCharacter[]; status: number };

const classIcons: Record<number, string> = {
  1: "war", 2: "pal", 3: "hunter", 4: "rogue", 5: "priest",
  6: "dk", 7: "shaman", 8: "mage", 9: "lock", 10: "monk",
  11: "druid", 12: "dh", 13: "evoker",
};
/** Game class colours mark the data (the card's edge and portrait ring), never the chrome. */
const classColorKeys: Record<number, keyof typeof classColors> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "death-knight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk",
  11: "druid", 12: "demon-hunter", 13: "evoker",
};
/** Placeholders while Battle.net answers: the cards' own box, so nothing moves when they arrive. */
const SKELETON_CARDS = 6;

function RosterHeading({ title, status }: { title: string; status?: string }) {
  return <div className={`${styles.rosterHeader} ${frost.rosterHeader}`}>
    <div className={frost.sectionTitle}>
      <Image className={frost.heraldry} src={characterFrostArt.heraldry} alt="" aria-hidden="true" width={256} height={256} sizes="72px" />
      <h2 id="character-roster-title">{title}</h2>
    </div>
    <p role="status">{status}</p>
  </div>;
}

/**
 * Body of the signed-in roster: loads every Battle.net region once, then
 * filters locally. The page hero and the copy (one locale) come from the server.
 */
export function CharacterRoster({ locale, copy, pendingRegions, secureEyebrow }: {
  locale: "en" | "ru";
  copy: RosterCopy;
  pendingRegions: BattleNetRegion[];
  secureEyebrow: string;
}) {
  const prefix = locale === "ru" ? "/ru" : "";
  const localeCode = locale === "ru" ? "ru-RU" : "en-US";
  const [characters, setCharacters] = useState<BattleNetCharacter[]>([]);
  const [error, setError] = useState<RosterError>();
  const [loading, setLoading] = useState(pendingRegions.length > 0);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(0);

  useEffect(() => {
    if (!pendingRegions.length) return;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetch(`/api/wow/characters/roster?regions=${pendingRegions.join(",")}&locale=${locale}`, { cache: "no-store", signal: controller.signal })
      .then(async (response): Promise<RegionResult[]> => {
        const payload = await response.json() as { regions?: RegionResult[] };
        if (!response.ok) return [{ region: pendingRegions[0], characters: [], status: response.status }];
        return Array.isArray(payload.regions) ? payload.regions : [];
      })
      .catch((): RegionResult[] => [{ region: pendingRegions[0], characters: [], status: 503 }])
      .then((results) => {
        if (controller.signal.aborted) return;
        const received = results.flatMap((result) => result.characters);
        if (received.length) {
          const unique = new Map(received.map((character) => [`${character.region}:${character.accountId}:${character.id}`, character]));
          setCharacters(Array.from(unique.values()).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, localeCode)));
        } else if (results.some((result) => result.status !== 200)) {
          const statuses = results.map((result) => result.status);
          setError(statuses.includes(429) ? "rate-limited" : statuses.includes(403) ? "forbidden" : statuses.includes(401) ? "expired" : "unavailable");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale, localeCode, pendingRegions]);

  const classes = useMemo(
    () => Array.from(new Map(characters.map((character) => [character.playableClass.id, character.playableClass.name])).entries())
      .sort((a, b) => a[1].localeCompare(b[1], localeCode)),
    [characters, localeCode],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(localeCode);
    return characters.filter((character) => {
      const haystack = `${character.name} ${character.realm.name} ${character.playableClass.name} ${character.playableRace.name}`.toLocaleLowerCase(localeCode);
      return (classId === 0 || character.playableClass.id === classId) && (!needle || haystack.includes(needle));
    });
  }, [characters, classId, localeCode, query]);

  if (error && !characters.length) {
    const retry = error === "unavailable" || error === "rate-limited";
    return (
      <AtlasPanel as="section" padding="lg" className={`${styles.state} ${frost.state}`} data-roster-state={error}>
        <FrostLoginCrest />
        <BattleNetConnectPanel eyebrowIcon={<FrostLoginIcon kind="lock" compact />} eyebrow={secureEyebrow} title={copy.stateTitle[error]} description={copy.stateText[error]}>
          {retry ? <a data-folio-action href={`${prefix}/wow/characters`}>{copy.retry}</a> : <BattleNetSignIn locale={locale} reconnect />}
        </BattleNetConnectPanel>
      </AtlasPanel>
    );
  }

  if (loading && !characters.length) {
    return (
      <section className={`${styles.roster} ${frost.roster}`} aria-labelledby="character-roster-title" aria-busy="true" data-roster-state="loading">
        <RosterHeading title={copy.rosterTitle} status={copy.loadingRegions} />
        <ul className={`${styles.grid} ${frost.grid}`} aria-hidden="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} className={`${styles.card} ${styles.skeleton} ${frost.card} ${frost.skeleton}`}>
              <span className={`${styles.classMark} ${frost.classMark}`} />
              <span className={styles.cardCopy}><i /><i /><i /></span>
              <span className={`${styles.level} ${frost.level}`} />
            </li>
          ))}
        </ul>
        <p className={styles.loadingNote}>{copy.loadingText}</p>
      </section>
    );
  }

  const filtersActive = Boolean(query) || classId !== 0;
  const count = (filtersActive ? copy.countFiltered : copy.countAll).replace("{shown}", String(filtered.length)).replace("{total}", String(characters.length));
  const topLevel = characters.reduce((highest, character) => Math.max(highest, character.level), 0);
  const summary = characters.length ? [
    { label: <span className={frost.statLabel}><FrostLoginIcon kind="equipment" compact />{copy.statCharacters}</span>, value: characters.length },
    { label: <span className={frost.statLabel}><FrostLoginIcon kind="combat" compact />{copy.statTopLevel.replace("{level}", String(topLevel))}</span>, value: characters.filter((character) => character.level === topLevel).length },
    { label: <span className={frost.statLabel}><FrostLoginIcon kind="talents" compact />{copy.statRealms}</span>, value: new Set(characters.map((character) => `${character.region}:${character.realm.slug}`)).size },
  ] : [];

  return (
    <section className={`${styles.roster} ${frost.roster}`} aria-labelledby="character-roster-title" data-roster-state={characters.length ? "loaded" : "empty"}>
      <RosterHeading title={copy.rosterTitle} status={`${filtersActive ? count : ""}${loading ? `${filtersActive ? " · " : ""}${copy.loadingRegions}` : ""}`} />
      {summary.length ? <AtlasStats items={summary} label={copy.summaryLabel} className={`${styles.summary} ${frost.summary}`} /> : null}

      {characters.length ? (
        <div className={`${styles.filters} ${frost.filters}`}>
          <label className={styles.field}>
            <span>{copy.searchLabel}</span>
            <span className={`${styles.inputWrap} ${frost.control}`} data-frost-control="search"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></span>
          </label>
          <label className={styles.field}>
            <span>{copy.classLabel}</span>
            <span className={`${frost.control} ${frost.selectControl}`} data-frost-control="class">
            <select value={classId} onChange={(event) => setClassId(Number(event.target.value))}>
              <option value={0}>{copy.allClasses}</option>
              {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            </span>
          </label>
        </div>
      ) : null}

      {filtered.length ? (
        <ul className={`${styles.grid} ${frost.grid}`}>
          {filtered.map((character, index) => {
            const icon = classIcon(classIcons[character.playableClass.id] ?? "");
            const colorKey = classColorKeys[character.playableClass.id];
            const style = { "--class-color": colorKey ? classColors[colorKey] : "var(--atlas-accent)", "--roster-index": Math.min(index, 11) } as CSSProperties;
            return (
              <li key={`${character.region}:${character.accountId}:${character.id}`} className={`${styles.card} ${frost.card}`} style={style} data-character-card>
                <span className={`${styles.classMark} ${frost.classMark}`} aria-hidden="true">
                  {icon ? <Image src={icon} alt="" width={72} height={72} sizes="52px" /> : character.playableClass.name.slice(0, 1)}
                </span>
                <div className={styles.cardCopy}>
                  <h3><a href={`${prefix}/wow/characters/${characterSlug(character)}`} aria-label={`${copy.openProfile}: ${character.name}`}>{character.name}</a></h3>
                  <p>{character.playableClass.name} · {character.playableRace.name}</p>
                  <p className={styles.cardMeta}>{character.realm.name} · {character.region.toUpperCase()} · {character.faction.name}</p>
                </div>
                <span className={`${styles.level} ${frost.level}`} aria-label={`${copy.level} ${character.level}`}>{character.level}</span>
                <ChevronRight className={styles.cardArrow} aria-hidden="true" />
                <a className={styles.armory} href={character.armoryUrl} target="_blank" rel="noreferrer">{copy.armory}<ExternalLink aria-hidden="true" /></a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={frost.empty}>
        <Image className={frost.emptyHeraldry} src={characterFrostArt.heraldry} alt="" aria-hidden="true" width={256} height={256} sizes="96px" />
        <AtlasNotice
          title={loading ? copy.loadingRegions : copy.emptyTitle}
          action={filtersActive ? <button type="button" data-folio-action="quiet" onClick={() => { setQuery(""); setClassId(0); }}>{copy.reset}</button> : undefined}
        >
          {loading ? copy.loadingText : filtersActive ? copy.noMatches : copy.emptyText}
        </AtlasNotice>
        </div>
      )}
    </section>
  );
}
