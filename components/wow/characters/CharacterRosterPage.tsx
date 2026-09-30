"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ChevronRight, ExternalLink, LockKeyhole, Search, Shield, Users } from "lucide-react";
import { BattleNetSignIn, BattleNetSignOut } from "@/components/auth/BattleNetActions";
import { CharacterBookBackdrop } from "@/components/wow/audit/CharacterBookBackdrop";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import grimoire from "@/components/wow/audit/grimoireControls.module.css";
import typography from "@/components/wow/audit/grimoireTypography.module.css";
import illumination from "@/components/wow/audit/characterBookIllumination.module.css";
import { BookEngraving } from "@/components/wow/audit/BookEngraving";
import surface from "@/components/wow/audit/characterBookSurface.module.css";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { characterSlug } from "@/lib/wow/battleNetCharacterDetails";
import { CharacterBookRibbon } from "./CharacterBookRibbon";
import { CharacterBookMasthead } from "./CharacterBookMasthead";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { CharacterEntryProof, CharacterEntryRoadmap } from "./CharacterEntryGuide";
import styles from "./characterRosterPage.module.css";

type Props = {
  characters: BattleNetCharacter[];
  locale: "en" | "ru";
  isConnected: boolean;
  accountName?: string;
  apiError?: "expired" | "forbidden" | "rate-limited" | "unavailable";
  pendingRegions?: BattleNetRegion[];
};

type RosterCopy = {
  title: string;
  connected: string;
  intro: string;
  characters: string;
  realms: string;
  classes: string;
  search: string;
  searchLabel: string;
  classLabel: string;
  all: string;
  roster: string;
  emptyTitle: string;
  emptyText: string;
  reset: string;
  noMatchingCharacters: string;
  openProfile: string;
  level: string;
  realm: string;
  faction: string;
  armory: string;
  source: string;
  connectTitle: string;
  connectText: string;
  expiredTitle: string;
  expiredText: string;
  forbiddenTitle: string;
  forbiddenText: string;
  rateTitle: string;
  rateText: string;
  unavailableTitle: string;
  unavailableText: string;
  contents: string;
  bookTitle: string;
  connectChapter: string;
  entryEyebrow: string;
  overview: string;
  searchChapter: string;
  rosterChapter: string;
  archive: string;
  secureAccess: string;
  loadingRegions: string;
};

const classIcons: Record<number, string> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "deathknight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk",
  11: "druid", 12: "demonhunter", 13: "evoker",
};

const copy: Record<"en" | "ru", RosterCopy> = {
  en: {
    title: "Account characters", connected: "Battle.net connected",
    intro: "After sign-in, your WoW characters load from the official Battle.net profile.",
    characters: "characters", realms: "realms", classes: "classes", search: "Name, realm or class…",
    searchLabel: "Find a character", classLabel: "Class", all: "All classes", roster: "Battle.net roster",
    emptyTitle: "No characters found", emptyText: "No World of Warcraft characters are available to this Battle.net account in EU, US, KR or TW.",
    reset: "Reset filters", noMatchingCharacters: "No characters match the selected filters.", openProfile: "Open profile", level: "Level", realm: "Realm", faction: "Faction", armory: "Open Armory", source: "Battle.net API",
    connectTitle: "Connect your Battle.net account", connectText: "Sign in with Battle.net to load your WoW characters.",
    expiredTitle: "Battle.net session expired", expiredText: "Connect your account again to refresh access to your character list.",
    forbiddenTitle: "World of Warcraft access was not granted", forbiddenText: "Reconnect Battle.net and confirm access to your WoW profile. If no permission screen appears, remove Gildra from Battle.net authorized applications and connect again.",
    rateTitle: "Battle.net request limit reached", rateText: "The account is connected. Wait a minute and try loading the characters again.",
    unavailableTitle: "Battle.net is temporarily unavailable", unavailableText: "The account is connected, but every regional character request failed. Please try again shortly.",
    contents: "Contents", bookTitle: "Heroes", connectChapter: "Connect", entryEyebrow: "Official API", overview: "Overview", searchChapter: "Search", rosterChapter: "Characters", archive: "Hero chronicle", secureAccess: "Secure Battle.net sign-in", loadingRegions: "Checking Battle.net regions…",
  },
  ru: {
    title: "Персонажи аккаунта", connected: "Battle.net подключён",
    intro: "После входа покажем персонажей WoW из официального профиля Battle.net.",
    characters: "персонажей", realms: "серверов", classes: "классов", search: "Имя, сервер или класс…",
    searchLabel: "Найти персонажа", classLabel: "Класс", all: "Все классы", roster: "Ростер Battle.net",
    emptyTitle: "Персонажи не найдены", emptyText: "На этом Battle.net-аккаунте не найдено персонажей WoW в регионах EU, US, KR или TW.",
    reset: "Сбросить фильтры", noMatchingCharacters: "По выбранным фильтрам персонажи не найдены.", openProfile: "Открыть профиль", level: "Уровень", realm: "Сервер", faction: "Фракция", armory: "Открыть арсенал", source: "Данные Battle.net",
    connectTitle: "Подключите аккаунт Battle.net", connectText: "Войдите через Battle.net — загрузим ваших героев WoW.",
    expiredTitle: "Сессия Battle.net истекла", expiredText: "Подключите аккаунт заново, чтобы обновить доступ к списку персонажей.",
    forbiddenTitle: "Доступ к персонажам WoW не выдан", forbiddenText: "Переподключите Battle.net и подтвердите доступ к профилю WoW. Если окно разрешений не появится, удалите Gildra из списка разрешённых приложений Battle.net и подключите снова.",
    rateTitle: "Battle.net ограничил число запросов", rateText: "Аккаунт подключён. Подождите минуту и попробуйте загрузить персонажей ещё раз.",
    unavailableTitle: "Battle.net временно недоступен", unavailableText: "Аккаунт подключён, но запрос списка персонажей завершился ошибкой во всех регионах. Попробуйте ещё раз чуть позже.",
    contents: "Оглавление", bookTitle: "Герои", connectChapter: "Подключение", entryEyebrow: "Официальный API", overview: "Обзор", searchChapter: "Поиск", rosterChapter: "Персонажи", archive: "Летопись героя", secureAccess: "Защищённый вход Battle.net", loadingRegions: "Проверяем регионы Battle.net…",
  },
};

const errorText = (error: Props["apiError"], t: RosterCopy) => {
  switch (error) {
    case "expired": return [t.expiredTitle, t.expiredText] as const;
    case "forbidden": return [t.forbiddenTitle, t.forbiddenText] as const;
    case "rate-limited": return [t.rateTitle, t.rateText] as const;
    case "unavailable": return [t.unavailableTitle, t.unavailableText] as const;
    default: return [t.connectTitle, t.connectText] as const;
  }
};

export function CharacterRosterPage({ characters, locale, isConnected, accountName, apiError, pendingRegions }: Props) {
  const t = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const [rosterCharacters, setRosterCharacters] = useState(characters);
  const [regionalError, setRegionalError] = useState<Props["apiError"]>();
  const [isLoadingRegions, setIsLoadingRegions] = useState(Boolean(isConnected && pendingRegions?.length));
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(0);
  const classes = useMemo(
    () => Array.from(new Map(rosterCharacters.map((character) => [character.playableClass.id, character.playableClass.name])).entries())
      .sort((a, b) => a[1].localeCompare(b[1])),
    [rosterCharacters],
  );
  const filtered = useMemo(() => {
    const localeCode = locale === "ru" ? "ru-RU" : "en-US";
    const normalized = query.trim().toLocaleLowerCase(localeCode);
    return rosterCharacters.filter((character) => {
      const haystack = `${character.name} ${character.realm.name} ${character.playableClass.name} ${character.playableRace.name}`.toLocaleLowerCase(localeCode);
      return (classId === 0 || character.playableClass.id === classId) && (!normalized || haystack.includes(normalized));
    });
  }, [rosterCharacters, classId, locale, query]);
  const effectiveApiError = rosterCharacters.length || isLoadingRegions ? undefined : regionalError ?? apiError;
  const [stateTitle, stateDescription] = errorText(effectiveApiError, t);
  const realmCount = new Set(rosterCharacters.map((character) => `${character.region}:${character.realm.id}`)).size;

  useEffect(() => {
    setRosterCharacters(characters);
    setRegionalError(undefined);
    if (!isConnected || !pendingRegions?.length) {
      setIsLoadingRegions(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingRegions(true);

    void fetch(`/api/wow/characters/roster?regions=${pendingRegions.join(",")}&locale=${locale}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as {
        regions?: Array<{ region: BattleNetRegion; characters: BattleNetCharacter[]; status: number }>;
      };
      if (!response.ok) return [{ region: pendingRegions[0], characters: [] as BattleNetCharacter[], status: response.status }];
      return Array.isArray(payload.regions) ? payload.regions : [];
    }).catch(() => [{ region: pendingRegions[0], characters: [] as BattleNetCharacter[], status: 503 }]).then((results) => {
      if (controller.signal.aborted) return;

      const received = results.flatMap((result) => result.characters);
      if (received.length) {
        const sortLocale = locale === "ru" ? "ru-RU" : "en-US";
        setRosterCharacters((current) => {
          const unique = new Map<string, BattleNetCharacter>();
          for (const character of [...current, ...received]) {
            unique.set(`${character.region}:${character.accountId}:${character.id}`, character);
          }
          return Array.from(unique.values()).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, sortLocale));
        });
      } else if (!characters.length && results.some((result) => result.status !== 200)) {
        const statuses = results.map((result) => result.status);
        const status = statuses.includes(429) ? 429 : statuses.includes(403) ? 403 : statuses.includes(401) ? 401 : 503;
        setRegionalError(status === 401 ? "expired" : status === 403 ? "forbidden" : status === 429 ? "rate-limited" : "unavailable");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoadingRegions(false);
    });

    return () => controller.abort();
  }, [characters, isConnected, locale, pendingRegions]);

  return (
    <main
      className={`${styles.roster} ${surface.root} ${grimoire.theme} ${typography.typography} ${illumination.page}`}
      data-character-book="open"
      data-roster-view={isConnected ? effectiveApiError ? "error" : "roster" : "entry"}
      lang={locale}
      style={physicalBookMaterials as CSSProperties}
    >
      <div className={surface.backdrop} data-character-book-backdrop aria-hidden="true"><CharacterBookBackdrop /></div>
      <div className={`${styles.bookContent} ${surface.content}`}>
        <div className={`${styles.manuscript} ${surface.manuscript}`}>
          <PhysicalBookFrame />
          <CharacterBookRibbon
            locale={locale}
            contents={t.contents}
            title={t.bookTitle}
            homeHref={`${prefix}/wow/characters`}
            items={[
              ...(isConnected && !effectiveApiError
                ? [
                    { number: "01", label: t.overview, href: "#account-overview" },
                    { number: "02", label: t.searchChapter, href: "#character-search" },
                    { number: "03", label: t.rosterChapter, href: "#character-roster", active: true },
                  ]
                : [{ number: "01", label: t.connectChapter, href: "#account-overview", active: true }]),
            ]}
          />

          <CharacterBookMasthead locale={locale} rightLabel={t.archive} />

          <header className={`${styles.hero} ${illumination.identity}`} id="account-overview">
            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}><Users aria-hidden="true" />{isConnected ? `${accountName ? `${accountName} · ` : ""}${t.connected}` : accountName ?? t.entryEyebrow}</span>
              <h1>{t.title}</h1>
              <p>{t.intro}</p>
              {!isConnected ? <CharacterEntryProof locale={locale} /> : null}
              {isConnected ? <div className={styles.sessionAction}><BattleNetSignOut locale={locale} /></div> : null}
            </div>
            {isConnected && !effectiveApiError ? (
              <dl className={styles.summary} aria-label={t.overview}>
                <div><dt>{t.characters}</dt><dd>{rosterCharacters.length}</dd></div>
                <div><dt>{t.realms}</dt><dd>{realmCount}</dd></div>
                <div><dt>{t.classes}</dt><dd>{classes.length}</dd></div>
              </dl>
            ) : (
              <BattleNetConnectPanel eyebrow={t.secureAccess} title={stateTitle} description={stateDescription}>
                {effectiveApiError === "unavailable" || effectiveApiError === "rate-limited"
                  ? <a data-folio-action="quiet" href={`${prefix}/wow/characters`}>{locale === "ru" ? "Повторить" : "Try again"}</a>
                  : <BattleNetSignIn locale={locale} reconnect={Boolean(effectiveApiError)} />}
                {!effectiveApiError ? <span className={styles.secureNote}><LockKeyhole aria-hidden="true" />{locale === "ru" ? "Пароль вводится только на стороне Blizzard." : "Your password stays with Blizzard."}</span> : null}
              </BattleNetConnectPanel>
            )}
          </header>

          {!isConnected ? (
            <CharacterEntryRoadmap locale={locale} />
          ) : null}

          {isConnected && !effectiveApiError ? (
            <>
              <section id="character-search" className={styles.filters} aria-label={t.searchChapter}>
                <label className={styles.searchField} data-folio-fields>
                  <span>{t.searchLabel}</span><span className={styles.inputWrap}><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.searchLabel} /></span>
                </label>
                <label className={styles.classField} data-folio-fields>
                  <span>{t.classLabel}</span><select value={classId} onChange={(event) => setClassId(Number(event.target.value))} aria-label={t.classLabel}>
                    <option value={0}>{t.all}</option>{classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
              </section>

              <section className={styles.results} aria-live="polite" id="character-roster">
                <header className={`${styles.chapterHeading} ${illumination.chapter}`}>
                  <div className={`${styles.chapterTitle} ${illumination.chapterTitle}`}>
                    <span className={styles.chapterIndex} data-folio-chapter>03</span>
                    <div><small>{t.connected}</small><h2>{t.roster}</h2></div>
                  </div>
                  <div className={`${styles.chapterSummary} ${illumination.chapterSummary}`}>
                    <div><span className={styles.chapterIcon}><Shield aria-hidden="true" /></span><p>{filtered.length} / {rosterCharacters.length} {t.characters}{isLoadingRegions ? ` · ${t.loadingRegions}` : ""}</p></div>
                    <BookEngraving motif="armory" />
                  </div>
                </header>
                    {filtered.length ? (
                  <div className={styles.grid}>
                    {filtered.map((character) => <CharacterCard key={`${character.accountId}:${character.id}`} character={character} t={t} prefix={prefix} />)}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <Search aria-hidden="true" /><div><h3>{isLoadingRegions ? t.loadingRegions : t.emptyTitle}</h3><p>{isLoadingRegions ? t.emptyText : query || classId !== 0 ? t.noMatchingCharacters : t.emptyText}</p></div>
                    {query || classId !== 0 ? <button data-folio-action="quiet" type="button" onClick={() => { setQuery(""); setClassId(0); }}>{t.reset}</button> : null}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function CharacterCard({ character, t, prefix }: { character: BattleNetCharacter; t: RosterCopy; prefix: string }) {
  const classIcon = classIcons[character.playableClass.id];
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <span className={styles.classMark} aria-hidden="true">
          {classIcon ? <Image src={`/assets/classes/${classIcon}.jpg`} alt="" width={44} height={44} /> : character.playableClass.name.slice(0, 1)}
        </span>
        <div className={styles.characterName}>
          <small>{character.playableClass.name} · {character.region.toUpperCase()}</small>
          <h3>{character.name}</h3>
          <p>{character.playableRace.name} · {character.faction.name}</p>
        </div>
        <span className={styles.levelSeal} aria-label={`${t.level} ${character.level}`}><b>{character.level}</b></span>
      </header>
      <div className={styles.cardDetails}>
        <div><small>{t.realm}</small><strong>{character.realm.name}</strong></div>
        <div><small>{t.faction}</small><strong>{character.faction.name}</strong></div>
      </div>
      <footer className={styles.cardActions}>
        <a data-folio-action href={`${prefix}/wow/characters/${characterSlug(character)}`}>{t.openProfile}<ChevronRight aria-hidden="true" /></a>
        <a data-folio-action="quiet" href={character.armoryUrl} target="_blank" rel="noreferrer">{t.armory}<ExternalLink aria-hidden="true" /></a>
      </footer>
      <span className={styles.sourceMark}><Shield aria-hidden="true" />{t.source}</span>
    </article>
  );
}
