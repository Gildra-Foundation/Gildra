"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, ExternalLink, Search } from "lucide-react";
import { AtlasNotice } from "@/components/atlas/AtlasNotice";
import { AtlasPanel } from "@/components/atlas/AtlasPanel";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterSlug } from "@/lib/wow/battleNetCharacterDetails";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import type { RosterCopy } from "./characterCopy";
import styles from "./characterRosterPage.module.css";

type RosterError = "expired" | "forbidden" | "rate-limited" | "unavailable";
type RegionResult = { region: BattleNetRegion; characters: BattleNetCharacter[]; status: number };

const classIcons: Record<number, string> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "deathknight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk",
  11: "druid", 12: "demonhunter", 13: "evoker",
};

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
      <AtlasPanel as="section" padding="lg" className={styles.state}>
        <BattleNetConnectPanel eyebrow={secureEyebrow} title={copy.stateTitle[error]} description={copy.stateText[error]}>
          {retry ? <a data-folio-action href={`${prefix}/wow/characters`}>{copy.retry}</a> : <BattleNetSignIn locale={locale} reconnect />}
        </BattleNetConnectPanel>
      </AtlasPanel>
    );
  }

  if (loading && !characters.length) {
    return <div className={styles.status} role="status" aria-busy="true"><AtlasNotice title={copy.loadingRegions}>{copy.loadingText}</AtlasNotice></div>;
  }

  const filtersActive = Boolean(query) || classId !== 0;
  const count = (filtersActive ? copy.countFiltered : copy.countAll).replace("{shown}", String(filtered.length)).replace("{total}", String(characters.length));

  return (
    <section className={styles.roster} aria-labelledby="character-roster-title">
      <div className={styles.rosterHeader}>
        <h2 id="character-roster-title">{copy.rosterTitle}</h2>
        <p role="status">{count}{loading ? ` · ${copy.loadingRegions}` : ""}</p>
      </div>

      {characters.length ? (
        <div className={styles.filters}>
          <label className={styles.field}>
            <span>{copy.searchLabel}</span>
            <span className={styles.inputWrap}><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></span>
          </label>
          <label className={styles.field}>
            <span>{copy.classLabel}</span>
            <select value={classId} onChange={(event) => setClassId(Number(event.target.value))}>
              <option value={0}>{copy.allClasses}</option>
              {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {filtered.length ? (
        <ul className={styles.grid}>
          {filtered.map((character) => {
            const icon = classIcons[character.playableClass.id];
            return (
              <li key={`${character.region}:${character.accountId}:${character.id}`} className={styles.card}>
                <span className={styles.classMark} aria-hidden="true">
                  {icon ? <Image src={`/assets/classes/${icon}.jpg`} alt="" width={48} height={48} sizes="48px" /> : character.playableClass.name.slice(0, 1)}
                </span>
                <div className={styles.cardCopy}>
                  <h3><a href={`${prefix}/wow/characters/${characterSlug(character)}`} aria-label={`${copy.openProfile}: ${character.name}`}>{character.name}</a></h3>
                  <p>{character.playableClass.name} · {character.playableRace.name}</p>
                  <p className={styles.cardMeta}>{character.realm.name} · {character.region.toUpperCase()} · {character.faction.name}</p>
                </div>
                <span className={styles.level} aria-label={`${copy.level} ${character.level}`}>{character.level}</span>
                <ChevronRight className={styles.cardArrow} aria-hidden="true" />
                <a className={styles.armory} href={character.armoryUrl} target="_blank" rel="noreferrer">{copy.armory}<ExternalLink aria-hidden="true" /></a>
              </li>
            );
          })}
        </ul>
      ) : (
        <AtlasNotice
          title={loading ? copy.loadingRegions : copy.emptyTitle}
          action={filtersActive ? <button type="button" data-folio-action="quiet" onClick={() => { setQuery(""); setClassId(0); }}>{copy.reset}</button> : undefined}
        >
          {loading ? copy.loadingText : filtersActive ? copy.noMatches : copy.emptyText}
        </AtlasNotice>
      )}
    </section>
  );
}
