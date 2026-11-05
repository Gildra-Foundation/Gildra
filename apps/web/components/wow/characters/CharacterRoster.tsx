"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterSlug } from "@/lib/wow/characterSlug";
import { classColors } from "@/lib/atlas/dataPalette";
import { classIcon } from "@/lib/games/wow/assets";
import { CharacterSignInButton, FrostButton } from "./CharacterActions";
import { characterFrostArt, factionColors, frostPlaqueStyle } from "./characterAtlasMaterial";
import { CharacterClassPicker } from "./CharacterClassPicker";
import type { RosterCopy } from "./characterCopy";
import styles from "./characterAtlas.module.css";

type RosterError = "expired" | "forbidden" | "rate-limited" | "unavailable";
type RegionResult = { region: BattleNetRegion; characters: BattleNetCharacter[]; status: number };
type SortKey = "level" | "name";

const classIcons: Record<number, string> = {
  1: "war", 2: "pal", 3: "hunter", 4: "rogue", 5: "priest",
  6: "dk", 7: "shaman", 8: "mage", 9: "lock", 10: "monk",
  11: "druid", 12: "dh", 13: "evoker",
};
/** Game class colours mark the data (the portrait ring and the class name), never the chrome. */
const classColorKeys: Record<number, keyof typeof classColors> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "death-knight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk",
  11: "druid", 12: "demon-hunter", 13: "evoker",
};
/** Placeholders while Battle.net answers: the cards' own box, so nothing moves when they arrive. */
const SKELETON_CARDS = 8;
/** Search, class and sort appear only when the account has more heroes than fit at a glance. */
const TOOLS_FROM = 7;

const characterKey = (character: BattleNetCharacter) => `${character.region}:${character.accountId}:${character.id}`;
const realmKey = (character: BattleNetCharacter) => `${character.region}:${character.realm.slug}`;

/** Faction as a small crest in the faction colour; the name stays for screen readers. */
function FactionCrest({ faction }: { faction: BattleNetCharacter["faction"] }) {
  const color = factionColors[faction.type as keyof typeof factionColors];
  if (!color) return null;
  return (
    <span className={styles.crest} style={{ "--faction-color": color } as CSSProperties} data-faction={faction.type.toLowerCase()}>
      <svg viewBox="0 0 16 18" aria-hidden="true" focusable="false">
        <path d="M8 1.2 14.6 3.6v5.2c0 3.9-2.7 6.7-6.6 8-3.9-1.3-6.6-4.1-6.6-8V3.6Z" />
        <path d="M8 4.4v9.4" />
      </svg>
      <span className={styles.srOnly}>{faction.name}</span>
    </span>
  );
}

/**
 * Body of the signed-in roster: loads every Battle.net region once, then filters locally.
 * Light cards (portrait ring in the class colour, name, level, class) grouped by realm; the whole card opens the profile.
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
  const [sort, setSort] = useState<SortKey>("level");

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
          setCharacters(Array.from(new Map(received.map((character) => [characterKey(character), character])).values()));
        } else if (results.some((result) => result.status !== 200)) {
          const statuses = results.map((result) => result.status);
          setError(statuses.includes(429) ? "rate-limited" : statuses.includes(403) ? "forbidden" : statuses.includes(401) ? "expired" : "unavailable");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale, pendingRegions]);

  const classChoices = useMemo(
    () => Array.from(new Map(characters.map((character) => [character.playableClass.id, character.playableClass.name])).entries())
      .sort((a, b) => a[1].localeCompare(b[1], localeCode))
      .map(([id, name]) => ({ id, name, icon: classIcon(classIcons[id] ?? "") })),
    [characters, localeCode],
  );

  /** Realm groups (one realm → one quiet heading), each sorted by the chosen key; the busiest, highest realm first. */
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(localeCode);
    const byName = (a: BattleNetCharacter, b: BattleNetCharacter) => a.name.localeCompare(b.name, localeCode);
    const order = sort === "level" ? (a: BattleNetCharacter, b: BattleNetCharacter) => b.level - a.level || byName(a, b) : byName;
    const realms = new Map<string, { key: string; realm: string; region: string; all: number; top: number; list: BattleNetCharacter[] }>();
    for (const character of characters) {
      const key = realmKey(character);
      const group = realms.get(key) ?? { key, realm: character.realm.name, region: character.region.toUpperCase(), all: 0, top: 0, list: [] };
      group.all += 1;
      group.top = Math.max(group.top, character.level);
      const haystack = `${character.name} ${character.realm.name} ${character.playableClass.name} ${character.playableRace.name}`.toLocaleLowerCase(localeCode);
      if ((classId === 0 || character.playableClass.id === classId) && (!needle || haystack.includes(needle))) group.list.push(character);
      realms.set(key, group);
    }
    return Array.from(realms.values())
      .sort((a, b) => b.top - a.top || b.all - a.all || a.realm.localeCompare(b.realm, localeCode))
      .map((group) => ({ ...group, list: group.list.sort(order) }));
  }, [characters, classId, localeCode, query, sort]);

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

  const filtersActive = Boolean(query.trim()) || classId !== 0;
  const shown = groups.reduce((sum, group) => sum + group.list.length, 0);
  const status = loading && !characters.length
    ? copy.loadingRegions
    : filtersActive && shown ? copy.countFiltered.replace("{shown}", String(shown)).replace("{total}", String(characters.length)) : "";
  const tools = characters.length >= TOOLS_FROM;
  const state = loading && !characters.length ? "loading" : characters.length ? "loaded" : "empty";

  return (
    <section id="roster" className={styles.roster} aria-busy={state === "loading" ? true : undefined} data-roster-state={state}>
      {tools ? (
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span className={styles.srOnly}>{copy.searchLabel}</span>
            <AtlasInput type="search" icon={<Search aria-hidden="true" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          {classChoices.length > 1
            ? <CharacterClassPicker className={styles.classField} labelClassName={styles.srOnly} label={copy.classLabel} allLabel={copy.allClasses} choices={classChoices} value={classId} onChange={setClassId} locale={localeCode} />
            : null}
          <AtlasSegmented className={styles.sort} aria-label={copy.sortLabel} value={sort} onValueChange={(value) => setSort(value as SortKey)}
            options={[{ value: "level", label: copy.sortLevel }, { value: "name", label: copy.sortName }]} />
        </div>
      ) : null}
      <p className={status ? styles.status : styles.srOnly} role="status">{status}</p>

      {state === "loading" ? (
        <ul className={styles.list} aria-hidden="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} className={`${styles.card} ${styles.skeleton}`}><span className={styles.portrait} /><span className={styles.lines}><i /><i /></span></li>
          ))}
        </ul>
      ) : shown ? (
        groups.filter((group) => group.list.length).map((group) => (
          <div key={group.key} className={styles.realm}>
            <h2 className={styles.realmTitle}>{group.realm}<span className={styles.realmRegion}>{group.region}</span></h2>
            <ul className={styles.list}>
              {group.list.map((character) => {
                const icon = classIcon(classIcons[character.playableClass.id] ?? "");
                const colorKey = classColorKeys[character.playableClass.id];
                const href = `${prefix}/wow/characters/${characterSlug(character)}`;
                const style = { "--class-color": colorKey ? classColors[colorKey] : "var(--atlas-accent)" } as CSSProperties;
                return (
                  <li key={characterKey(character)} className={styles.card} style={style} data-character-card>
                    <span className={styles.portrait} aria-hidden="true">
                      {icon ? <Image src={icon} alt="" width={56} height={56} sizes="56px" unoptimized loading="lazy" /> : null}
                    </span>
                    <div className={styles.cardCopy}>
                      <h3 className={styles.cardTitle}><a className={styles.cardLink} href={href}>{character.name}</a></h3>
                      <p className={styles.cardMeta}>
                        <FactionCrest faction={character.faction} />
                        <span className={styles.className}>{character.playableClass.name}</span>
                        <span className={styles.race}>{character.playableRace.name}</span>
                      </p>
                    </div>
                    <span className={styles.level}><span className={styles.srOnly}>{copy.level} </span>{character.level}</span>
                    <a className={styles.armory} href={character.armoryUrl} target="_blank" rel="noreferrer">
                      <ArrowUpRight aria-hidden="true" /><span className={styles.srOnly}>{copy.armory}: {character.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <MaterialPlaque kit={CHARACTERS_KIT} style={frostPlaqueStyle} className={`${styles.plaque} ${styles.state}`}>
          <Image className={styles.heraldry} src={characterFrostArt.heraldry} alt="" aria-hidden="true" width={256} height={256} sizes="88px" />
          <div className={styles.stateCopy}>
            <h2 className={materialStyles.title}>{filtersActive ? copy.noMatches : copy.emptyTitle}</h2>
            {filtersActive ? null : <p className={materialStyles.text}>{copy.emptyText}</p>}
            {filtersActive ? <div className={styles.stateAction}><FrostButton fit="stack" onClick={() => { setQuery(""); setClassId(0); }}>{copy.reset}</FrostButton></div> : null}
          </div>
        </MaterialPlaque>
      )}
    </section>
  );
}
