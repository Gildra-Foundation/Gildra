"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, BellRing, BookOpen, Check, ChevronRight, Crown, Eye, EyeOff, Gamepad2, Link2, Mail, Orbit, Pencil, Radio, Save, Shield, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import { ResilientImage } from "@/components/media/ResilientImage";
import type { Lang } from "@/lib/i18n";
import type { PlatformGameId, PlatformHomeData } from "@/lib/platform/home/types";
import { platformHref } from "@/lib/platform/home/links";
import styles from "./profilePage.module.css";
import type { BattleNetCharacter, BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { BattleNetSignIn, BattleNetSignOut } from "@/components/auth/BattleNetActions";

const copy = {
  en: { role: "Worldwalker", joined: "Command profile", active: "Live now", private: "Private", public: "Public", edit: "Edit profile", done: "Done", builds: "Saved Builds", tracked: "Tracked Heroes", worlds: "Connected Worlds", viewed: "Intel Viewed", characters: "Tracked Characters", all: "View all", gear: "Gear planner", saved: "Saved Builds", game: "Game", roleLabel: "Focus", updated: "Updated", rating: "Rating", compare: "Compare", history: "Recent Activity", connected: "Connected Worlds", connectedHint: "Select a world to inspect its active profile.", selected: "Active workspace", constellation: "Your Constellation", constellationHint: "The shape of your cross-game identity, generated from your tracked worlds.", digest: "Weekly Digest", digestText: "A personalized summary of builds, patches and meta changes every Monday.", on: "On", off: "Off", resume: "Resume", privacy: "Privacy" },
  ru: { role: "Странник миров", joined: "Командный профиль", active: "Сейчас в сети", private: "Закрытый", public: "Открытый", edit: "Изменить профиль", done: "Готово", builds: "Сохранённые билды", tracked: "Отслеживаемые герои", worlds: "Связанные миры", viewed: "Изучено материалов", characters: "Отслеживаемые персонажи", all: "Смотреть все", gear: "Экипировка", saved: "Сохранённые билды", game: "Игра", roleLabel: "Фокус", updated: "Обновлено", rating: "Рейтинг", compare: "Сравнить", history: "Последняя активность", connected: "Связанные миры", connectedHint: "Выберите мир, чтобы посмотреть активный профиль.", selected: "Активная область", constellation: "Ваше созвездие", constellationHint: "Отпечаток вашей игровой личности, собранный из отслеживаемых миров.", digest: "Еженедельный дайджест", digestText: "Персональная сводка билдов, патчей и меты каждый понедельник.", on: "Вкл", off: "Выкл", resume: "Продолжить", privacy: "Приватность" },
};

export function ProfilePage({ data, lang, battleNet }: { data: PlatformHomeData; lang: Lang; battleNet?: { accountName?: string; characters: BattleNetCharacter[]; error?: boolean; pendingRegions?: readonly BattleNetRegion[] } }) {
  const t = copy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const [isPrivate, setPrivate] = useState(true);
  const [editing, setEditing] = useState(false);
  const [digest, setDigest] = useState(true);
  const [profileCharacters, setProfileCharacters] = useState(battleNet?.characters ?? []);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(Boolean(battleNet?.pendingRegions?.length));
  const [regionalError, setRegionalError] = useState(false);
  const battleNetError = !profileCharacters.length && !isLoadingCharacters && Boolean(regionalError || battleNet?.error);
  const [selectedWorld, setSelectedWorld] = useState<PlatformGameId>(data.games[0]?.id ?? "wow");
  const selectedGame = data.games.find((game) => game.id === selectedWorld)!;
  const selectedMeta = data.personalMeta.find((entry) => entry.gameId === selectedWorld);
  const defaultProfileName = battleNet?.accountName ?? (data.profile.name === "Arcanist" ? "Arcanist Vexis" : data.profile.name);
  const [profileName, setProfileName] = useState(defaultProfileName);
  const [draftName, setDraftName] = useState(defaultProfileName);
  const activity = [...data.continueItems.slice(0, 3).map((item) => ({ icon: <Gamepad2 />, action: t.resume, title: item.title, gameId: item.gameId, detail: item.activityDetail })), ...data.savedBuilds.slice(0, 2).map((item) => ({ icon: <Save />, action: t.builds, title: item.title, gameId: item.gameId, detail: item.updatedAt }))];

  useEffect(() => {
    try {
      const savedName = window.localStorage.getItem("gildra:profile-name")?.trim();
      if (savedName) { setProfileName(savedName); setDraftName(savedName); }
    } catch { /* The profile remains editable when storage is restricted. */ }
  }, []);

  useEffect(() => {
    setProfileCharacters(battleNet?.characters ?? []);
    setRegionalError(false);
    const pendingRegions = battleNet?.pendingRegions;
    if (!pendingRegions?.length) {
      setIsLoadingCharacters(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingCharacters(true);
    void fetch(`/api/wow/characters/roster?regions=${pendingRegions.join(",")}&locale=${lang}`, {
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

      const received = results.flatMap((result) => result.characters.map((character) => ({
        ...character,
        armoryUrl: `${prefix}/wow/characters/${character.region}--${character.realm.slug}--${encodeURIComponent(character.name.toLowerCase())}`,
      })));
      if (received.length) {
        const sortLocale = lang === "ru" ? "ru-RU" : "en-US";
        setProfileCharacters((current) => {
          const unique = new Map<string, BattleNetCharacter>();
          for (const character of [...current, ...received]) {
            unique.set(`${character.region}:${character.accountId}:${character.id}`, character);
          }
          return Array.from(unique.values()).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, sortLocale));
        });
      } else if (!battleNet?.characters.length && results.some((result) => result.status !== 200)) {
        setRegionalError(true);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoadingCharacters(false);
    });

    return () => controller.abort();
  }, [battleNet?.characters, battleNet?.error, battleNet?.pendingRegions, lang, prefix]);

  const finishEditing = () => {
    if (editing) {
      const nextName = draftName.trim() || defaultProfileName;
      setProfileName(nextName);
      setDraftName(nextName);
      try { window.localStorage.setItem("gildra:profile-name", nextName); } catch { /* Local state still reflects the edit. */ }
    }
    setEditing((value) => !value);
  };

  return <div className={homeStyles.page} data-platform-home>
    <PlatformMotion />
    <PlatformAtmosphere accent={selectedGame.accent} />
    <PlatformHeader data={data} lang={lang} scopeLabel={profileName} />
    <main className={styles.page}>
      <section className={styles.profileHero} data-reveal style={{ "--profile-accent": selectedGame.accent } as React.CSSProperties}>
        <div className={styles.crest} aria-hidden="true"><i /><i /><Sparkles /><b>{data.games.length}</b></div>
        <div className={styles.identity}><span><Crown />{t.role}</span><h1>{editing ? <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={32} autoFocus aria-label={lang === "ru" ? "Имя профиля" : "Profile name"} /> : profileName}<button type="button" onClick={finishEditing} aria-label={editing ? t.done : t.edit}>{editing ? <Check /> : <Pencil />}</button></h1><p><Radio />{t.active}<i />{t.joined}</p></div>
        <div className={styles.privacy}><small><Shield />{t.privacy}</small><button type="button" onClick={() => setPrivate((value) => !value)}>{isPrivate ? <EyeOff /> : <Eye />}{isPrivate ? t.private : t.public}</button></div>
        <button className={editing ? styles.editing : styles.edit} type="button" onClick={finishEditing}>{editing ? <Check /> : <Pencil />}<span>{editing ? t.done : t.edit}</span></button>
        <div className={styles.heroWorlds}>{data.games.map((game) => <button type="button" onClick={() => setSelectedWorld(game.id)} className={game.id === selectedWorld ? styles.active : ""} aria-label={game.name} key={game.id}><img src={game.iconUrl} alt="" width="48" height="48" /><span>{game.name}</span></button>)}</div>
      </section>

      <section className={styles.statRail} data-reveal>
        <Stat icon={<Save />} value={data.savedBuilds.length} label={t.builds} />
        <Stat icon={<Users />} value={battleNet?.accountName ? isLoadingCharacters ? "…" : profileCharacters.length : data.personalMeta.length} label={t.tracked} />
        <Stat icon={<Orbit />} value={data.games.length} label={t.worlds} />
        <Stat icon={<BookOpen />} value={data.recommendations.length + data.patchPulse.reduce((sum, group) => sum + group.changes.length, 0)} label={t.viewed} />
      </section>

      <div className={styles.layout}>
        <div className={styles.primary}>
          <section className={styles.panel} data-reveal><PanelHeading title={t.characters} action={t.all} href={`${prefix}/wow/characters`} />
            {battleNet?.accountName ? profileCharacters.length ? <div className={styles.characterGrid}>{profileCharacters.slice(0, 6).map((character) => <a href={character.armoryUrl} target="_blank" rel="noreferrer" className={styles.character} style={{ "--game-color": "#148eff" } as React.CSSProperties} key={`${character.accountId}:${character.id}`}><span className={styles.characterGame}><Users />World of Warcraft</span><div className={styles.importedCrest} aria-hidden="true">{character.playableClass.name.slice(0, 1)}</div><h3>{character.name}</h3><p>{character.playableClass.name} · {character.playableRace.name}</p><div><span>{lang === "ru" ? "Уровень" : "Level"}<b>{character.level}</b></span><span>{lang === "ru" ? "Сервер" : "Realm"}<b>{character.realm.name}</b></span></div></a>)}</div> : <div className={styles.accountEmpty}><Users /><h3>{isLoadingCharacters ? (lang === "ru" ? "Загружаем персонажей…" : "Loading characters…") : (lang === "ru" ? "Персонажи не найдены" : "No characters found")}</h3><p>{isLoadingCharacters ? (lang === "ru" ? "Проверяем регионы Battle.net." : "Checking Battle.net regions.") : (lang === "ru" ? "Проверьте регион Battle.net или доступность профиля WoW." : "Check your Battle.net region or WoW profile availability.")}</p></div> : <div className={styles.accountConnect}><div><Shield /><span><h3>{lang === "ru" ? "Подключите Battle.net" : "Connect Battle.net"}</h3><p>{battleNetError ? (lang === "ru" ? "Не удалось загрузить профиль Blizzard." : "Could not load the Blizzard profile.") : (lang === "ru" ? "Войдите, чтобы добавить своих персонажей в профиль." : "Sign in to add your characters to this profile.")}</p></span></div><BattleNetSignIn locale={lang} reconnect={battleNetError} /></div>}
          </section>

          <section className={styles.panel} data-reveal><PanelHeading title={t.saved} action={t.all} href={`${prefix}/search?type=items`} />
            <div className={styles.buildTable}><div className={styles.tableHead}><span>{t.builds}</span><span>{t.game}</span><span>{t.roleLabel}</span><span>{t.updated}</span><span>{t.rating}</span><span>{t.compare}</span></div>{data.savedBuilds.map((build) => { const game = data.games.find((item) => item.id === build.gameId)!; const meta = data.personalMeta.find((item) => item.gameId === build.gameId); return <a href={platformHref(build.href, lang)} className={styles.buildRow} key={build.id}><span><ResilientImage src={build.imageUrl} alt="" width={28} height={28} loading="lazy" fallback={<img src={game.iconUrl} alt="" width="28" height="28" />} /><b>{build.title}</b></span><span>{game.name}</span><span>{meta?.focusDetail ?? build.subtitle}</span><span><i />{build.updatedAt}</span><strong>{meta?.score ?? "—"}</strong><Swords /></a>; })}</div>
          </section>

          <section className={styles.panel} data-reveal><PanelHeading title={t.history} action={t.all} href={prefix || "/"} />
            <div className={styles.history}>{activity.map((item, index) => { const game = data.games.find((candidate) => candidate.id === item.gameId)!; return <div key={`${item.title}-${index}`}><span style={{ color: game.accent }}>{item.icon}</span><small>{item.action}</small><strong>{item.title}</strong><em>{game.name}</em><time>{item.detail}</time></div>; })}</div>
          </section>
        </div>

        <aside className={styles.sidebar}>
          {battleNet?.accountName ? <section className={`${styles.panel} ${styles.battleAccount}`} data-reveal><PanelHeading title="Battle.net" /><div><span aria-hidden="true">B</span><p><small>{lang === "ru" ? "Подключённый аккаунт" : "Connected account"}</small><strong>{battleNet.accountName}</strong></p></div><BattleNetSignOut locale={lang} /></section> : null}
          <section className={styles.panel} data-reveal><PanelHeading title={t.connected} /><p className={styles.panelHint}>{t.connectedHint}</p><div className={styles.worldList}>{data.games.map((game) => { const meta = data.personalMeta.find((item) => item.gameId === game.id); return <button type="button" onClick={() => setSelectedWorld(game.id)} className={game.id === selectedWorld ? styles.active : ""} key={game.id}><img src={game.iconUrl} alt="" width="36" height="36" /><span><b>{game.name}</b><small>{meta?.focus ?? game.subtitle}</small></span><em><i />{t.selected}</em><ChevronRight /></button>; })}</div></section>
          <section className={`${styles.panel} ${styles.constellation}`} data-reveal style={{ "--constellation-accent": selectedGame.accent } as React.CSSProperties}><PanelHeading title={t.constellation} /><div className={styles.starMap}><i /><i /><i /><i /><i /><span><img src={selectedGame.iconUrl} alt="" width="58" height="58" /></span>{data.games.map((game, index) => <button style={{ "--star-index": index } as React.CSSProperties} onClick={() => setSelectedWorld(game.id)} aria-label={game.name} key={game.id}><img src={game.iconUrl} alt="" width="30" height="30" /></button>)}</div><p>{t.constellationHint}</p>{selectedMeta ? <strong>{selectedMeta.focus} · {selectedMeta.rankValue}</strong> : null}</section>
          <section className={`${styles.panel} ${styles.digest}`} data-reveal><span><Mail /></span><div><h2>{t.digest}</h2><p>{t.digestText}</p></div><button type="button" role="switch" aria-checked={digest} onClick={() => setDigest((value) => !value)}><i className={digest ? styles.on : ""} /><b>{digest ? t.on : t.off}</b></button></section>
        </aside>
      </div>
    </main>
  </div>;
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) { return <div><span>{icon}</span><strong data-count>{value}</strong><small>{label}</small></div>; }
function PanelHeading({ title, action, href = "#" }: { title: string; action?: string; href?: string }) { return <header className={styles.panelHeading}><h2>{title}</h2>{action ? <a href={href}>{action}<ArrowRight /></a> : null}</header>; }
