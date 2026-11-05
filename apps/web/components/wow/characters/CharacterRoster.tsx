"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, MapPin, RefreshCw, Search } from "lucide-react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterSlug } from "@/lib/wow/characterSlug";
import { classColors } from "@/lib/atlas/dataPalette";
import { classIcon } from "@/lib/games/wow/assets";
import { CharacterSignInButton, FrostButton, FrostLinkButton } from "./CharacterActions";
import { characterFrostArt, frostPlaqueStyle } from "./characterAtlasMaterial";
import { CharacterClassPicker } from "./CharacterClassPicker";
import type { RosterCopy } from "./characterCopy";
import styles from "./characterAtlas.module.css";

type RosterError = "expired" | "forbidden" | "rate-limited" | "unavailable";
type RegionResult = { region: BattleNetRegion; characters: BattleNetCharacter[]; status: number };

const classIcons: Record<number, string> = {
  1: "war", 2: "pal", 3: "hunter", 4: "rogue", 5: "priest",
  6: "dk", 7: "shaman", 8: "mage", 9: "lock", 10: "monk",
  11: "druid", 12: "dh", 13: "evoker",
};
/** Game class colours mark the data (the portrait's edge), never the chrome. */
const classColorKeys: Record<number, keyof typeof classColors> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "death-knight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk",
  11: "druid", 12: "demon-hunter", 13: "evoker",
};
/** Placeholders while Battle.net answers: the cards' own box, so nothing moves when they arrive. */
const SKELETON_CARDS = 6;

/**
 * Body of the signed-in roster: loads every Battle.net region once, then filters locally.
 * The roster is a reference section of "portrait + plaque" cards; the count sits beside its title.
 */
export function CharacterRoster({ locale, copy, pendingRegions }: {
  locale: "en" | "ru";
  copy: RosterCopy;
  pendingRegions: BattleNetRegion[];
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
  const classChoices = useMemo(() => classes.map(([id, name]) => ({ id, name, icon: classIcon(classIcons[id] ?? "") })), [classes]);
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
      <MaterialPlaque as="section" kit={CHARACTERS_KIT} style={frostPlaqueStyle} className={`${styles.plaque} ${styles.state}`} data-roster-state={error} aria-labelledby="roster-state-title">
        <Image className={styles.heraldry} src={characterFrostArt.heraldry} alt="" aria-hidden="true" width={256} height={256} sizes="88px" />
        <div className={styles.stateCopy}>
          <h2 id="roster-state-title" className={materialStyles.title}>{copy.stateTitle[error]}</h2>
          <p className={materialStyles.text}>{copy.stateText[error]}</p>
          <div className={styles.stateAction}>
            {retry
              ? <FrostButton fit="stack" icon={<RefreshCw aria-hidden="true" />} onClick={() => window.location.reload()}>{copy.retry}</FrostButton>
              : <CharacterSignInButton locale={locale} reconnect />}
          </div>
        </div>
      </MaterialPlaque>
    );
  }

  const filtersActive = Boolean(query) || classId !== 0;
  const count = (filtersActive ? copy.countFiltered : copy.countAll).replace("{shown}", String(filtered.length)).replace("{total}", String(characters.length));
  const status = loading ? copy.loadingRegions : characters.length ? count : "";

  return (
    <>
      <AtlasSection id="roster" title={copy.rosterTitle} className={styles.section}
        aside={<p className={styles.status} role="status">{status}</p>}>
        <div className={styles.rosterBody} aria-busy={loading && !characters.length ? true : undefined} data-roster-state={loading && !characters.length ? "loading" : characters.length ? "loaded" : "empty"}>
          {characters.length ? (
            <div className={styles.filters}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.searchLabel}</span>
                <AtlasInput type="search" icon={<Search aria-hidden="true" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
              </label>
              <CharacterClassPicker className={styles.field} labelClassName={styles.fieldLabel} label={copy.classLabel} allLabel={copy.allClasses} choices={classChoices} value={classId} onChange={setClassId} locale={localeCode} />
            </div>
          ) : null}

          {loading && !characters.length ? (
            <ul className={styles.grid} aria-hidden="true">
              {Array.from({ length: SKELETON_CARDS }, (_, index) => (
                <li key={index}>
                  <MaterialPlaque kit={CHARACTERS_KIT} style={frostPlaqueStyle} className={`${styles.plaque} ${styles.card} ${styles.skeleton}`}>
                    <span className={styles.cardHead}><span className={styles.portrait} /><span className={styles.lines}><i /><i /></span></span>
                    <span className={styles.lines}><i /><i /></span>
                  </MaterialPlaque>
                </li>
              ))}
            </ul>
          ) : filtered.length ? (
            <ul className={styles.grid}>
              {filtered.map((character) => {
                const icon = classIcon(classIcons[character.playableClass.id] ?? "");
                const colorKey = classColorKeys[character.playableClass.id];
                const href = `${prefix}/wow/characters/${characterSlug(character)}`;
                const style = { ...frostPlaqueStyle, "--class-color": colorKey ? classColors[colorKey] : "var(--atlas-accent)" } as CSSProperties;
                return (
                  <li key={`${character.region}:${character.accountId}:${character.id}`} data-character-card>
                    <MaterialPlaque as="article" kit={CHARACTERS_KIT} style={style} className={`${styles.plaque} ${styles.card}`}>
                      <div className={styles.cardHead}>
                        <span className={styles.portrait} aria-hidden="true">
                          {icon ? <Image src={icon} alt="" width={72} height={72} sizes="64px" /> : null}
                        </span>
                        <div className={styles.cardName}>
                          <p className={styles.cardEyebrow}><MapPin aria-hidden="true" />{character.realm.name} · {character.region.toUpperCase()}</p>
                          <h3 className={styles.cardTitle}><a href={href}>{character.name}</a></h3>
                        </div>
                      </div>
                      <p className={styles.cardFacts}>
                        <span className={styles.level}>{copy.level} <b>{character.level}</b></span>
                        <span>{character.playableClass.name} · {character.playableRace.name}</span>
                        <span>{character.faction.name}</span>
                      </p>
                      <FrostLinkButton fit="block" href={href} prefetch={false} iconAfter={<ArrowRight aria-hidden="true" />}>
                        {copy.openProfile}<span className={styles.srOnly}>: {character.name}</span>
                      </FrostLinkButton>
                      <a className={styles.quietLink} href={character.armoryUrl} target="_blank" rel="noreferrer">{copy.armory}<span className={styles.srOnly}>: {character.name}</span><ArrowUpRight aria-hidden="true" /></a>
                    </MaterialPlaque>
                  </li>
                );
              })}
            </ul>
          ) : (
            <MaterialPlaque kit={CHARACTERS_KIT} style={frostPlaqueStyle} className={`${styles.plaque} ${styles.state}`}>
              <Image className={styles.heraldry} src={characterFrostArt.heraldry} alt="" aria-hidden="true" width={256} height={256} sizes="88px" />
              <div className={styles.stateCopy}>
                <h3 className={materialStyles.title}>{filtersActive ? copy.noMatches : copy.emptyTitle}</h3>
                {filtersActive ? null : <p className={materialStyles.text}>{copy.emptyText}</p>}
                {filtersActive ? <div className={styles.stateAction}><FrostButton fit="stack" onClick={() => { setQuery(""); setClassId(0); }}>{copy.reset}</FrostButton></div> : null}
              </div>
            </MaterialPlaque>
          )}
        </div>
      </AtlasSection>
    </>
  );
}
