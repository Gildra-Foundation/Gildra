import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Crown, ExternalLink, Gem, Gauge, MapPin, Navigation, Shield, ShieldCheck, Skull, Swords, UsersRound } from "lucide-react";
import { getLootIcon, type Boss } from "@/lib/lairs";
import { CopyWaypointButton } from "./CopyWaypointButton";
import { JournalMotion } from "./JournalMotion";

const actionLabels: Record<"ru" | "en", Record<string, string>> = {
  ru: {
    DODGE: "УКЛОНИТЬСЯ", SOAK: "ПЕРЕХВАТИТЬ", INTERRUPT: "СБИТЬ КАСТ", DISPEL: "РАССЕЯТЬ",
    HEAL: "ПРОХИЛИТЬ", TANK: "ТАНКУ", KILL: "УБИТЬ ПЕРВЫМ", RUN: "ВЫБЕЖАТЬ", MOVE: "СМЕСТИТЬСЯ",
    SPREAD: "РАЗОЙТИСЬ", FRONTAL: "УЙТИ ИЗ ФРОНТАЛА", TANK_SWAP: "СМЕНА ТАНКА", DEFENSIVE: "ЗАЩИТЫ / CD",
    HARD_CC: "ОСТАНОВИТЬ КОНТРОЛЕМ", TARGET_PRIORITY: "ПРИОРИТЕТНАЯ ЦЕЛЬ",
  },
  en: {
    DODGE: "DODGE", SOAK: "SOAK", INTERRUPT: "INTERRUPT", DISPEL: "DISPEL",
    HEAL: "HEAL THROUGH", TANK: "TANK RESPONSE", KILL: "KILL FIRST", RUN: "RUN OUT", MOVE: "MOVE",
    SPREAD: "SPREAD", FRONTAL: "DODGE THE FRONTAL", TANK_SWAP: "TANK SWAP", DEFENSIVE: "USE DEFENSIVES",
    HARD_CC: "HARD CC", TARGET_PRIORITY: "PRIORITY TARGET",
  },
};
const difficultyIcons = [UsersRound, Shield, Swords, Crown];
const kindLabels = {
  ru: { lair: "БОСС ЛОГОВА", world: "МИРОВОЙ БОСС", dungeon: "БОСС ПОДЗЕМЕЛЬЯ", delve: "БОСС DELVE" },
  en: { lair: "LAIR BOSS", world: "WORLD BOSS", dungeon: "DUNGEON BOSS", delve: "DELVE BOSS" },
} as const;

const guideCopy = {
  ru: {
    breadcrumb: "Боссы Season 2", location: "МЕСТО", group: "ГРУППА", lockout: "ЛОКАУТ", fightSummary: "БОЙ В ДВУХ СЛОВАХ",
    verified: "Проверено", strategySource: "Источник тактики", sectionsLabel: "Разделы", locationTab: "Место и фарм", abilitiesTab: "Способности",
    positionTab: "Позиции", groupTab: "Состав", difficultyTab: "Сложность", lootTab: "Добыча", quickAnswer: "БЫСТРЫЙ ОТВЕТ", next: "СЛЕДУЮЩИЙ",
    locationEyebrow: "МЕСТО И ФАРМ", find: "Где найти", mapAlt: "Карта", dungeonFarm: "Фарм подземелья", delveFarm: "Фарм Delve", weeklyFarm: "Еженедельный фарм",
    access: "Доступ", bestLoot: "Лучший лут", copyWaypoint: "Скопировать координаты", copied: "Скопировано", copy: "Копировать",
    abilities: "Способности и реакция", casts: "Кастует", spellUnverified: "Spell ID не подтверждён", audience: "Кому", source: "источник",
    positioning: "ПОЗИЦИОНИРОВАНИЕ", whereToStand: "Где стоять и куда двигаться", recommendedGroup: "РЕКОМЕНДУЕМАЯ ГРУППА", partyComposition: "Состав группы", raidComposition: "Состав рейда",
    tanks: "ТАНКИ", healers: "ХИЛЫ", damage: "DAMAGE", tankNote: "Смена на танковой механике", healerNote: "Распределить рейдовые CD", damageNote: "Приоритет аддов и cleave",
    modeReward: "РЕЖИМ И НАГРАДА", difficulty: "Сложность", reward: "Награда", lootTable: "ТАБЛИЦА ДОБЫЧИ", whatToFarm: "Что фармить",
    item: "Предмет", slotType: "Слот / тип", stats: "Характеристика", difficultyIlvl: "Сложность / ilvl", chance: "Шанс", unverified: "не подтверждён", ilvlUnverified: "ilvl не подтверждён",
    exactChanceUnknown: "Точный шанс выпадения не опубликован", lootVerified: "Список предметов проверен",
  },
  en: {
    breadcrumb: "Season 2 Bosses", location: "LOCATION", group: "GROUP", lockout: "LOCKOUT", fightSummary: "FIGHT AT A GLANCE",
    verified: "Verified", strategySource: "Strategy source", sectionsLabel: "Guide sections", locationTab: "Location and farming", abilitiesTab: "Abilities",
    positionTab: "Positioning", groupTab: "Composition", difficultyTab: "Difficulty", lootTab: "Loot", quickAnswer: "QUICK ANSWER", next: "NEXT",
    locationEyebrow: "LOCATION AND FARMING", find: "Where to find", mapAlt: "Map", dungeonFarm: "Dungeon farming", delveFarm: "Delve farming", weeklyFarm: "Weekly farming",
    access: "Access", bestLoot: "Best loot", copyWaypoint: "Copy coordinates", copied: "Copied", copy: "Copy",
    abilities: "Abilities and responses", casts: "Cast by", spellUnverified: "Spell ID unverified", audience: "Who responds", source: "source",
    positioning: "POSITIONING", whereToStand: "Where to stand and how to move", recommendedGroup: "RECOMMENDED GROUP", partyComposition: "Party composition", raidComposition: "Raid composition",
    tanks: "TANKS", healers: "HEALERS", damage: "DAMAGE", tankNote: "Swap for the tank mechanic", healerNote: "Assign raid cooldowns", damageNote: "Prioritize adds and cleave",
    modeReward: "MODE AND REWARD", difficulty: "Difficulty", reward: "Reward", lootTable: "LOOT TABLE", whatToFarm: "What to farm",
    item: "Item", slotType: "Slot / type", stats: "Stats", difficultyIlvl: "Difficulty / ilvl", chance: "Chance", unverified: "unverified", ilvlUnverified: "ilvl unverified",
    exactChanceUnknown: "The exact drop chance has not been published", lootVerified: "Loot list verified",
  },
} as const;

export function LairBossGuide({ boss, nextBoss, locale = "ru" }: { boss: Boss; nextBoss: Boss; locale?: "ru" | "en" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const copy = guideCopy[locale];
  const actionLabel = actionLabels[locale];
  const kindLabel = kindLabels[locale];
  return (
    <main className="lair-guide wow-journal" data-lairs-root style={{ "--boss-accent": boss.accent } as React.CSSProperties}>
      <JournalMotion />
      <div className="lair-guide-shell lairs-shell">
        <nav className="guide-breadcrumb"><Link href={`${prefix}/wow/lairs`}><ArrowLeft /> {copy.breadcrumb}</Link><span>/</span><b>{boss.name}</b></nav>

        <header className="boss-journal-head" data-reveal data-reactive>
          <div className="boss-journal-art"><Image src={boss.portrait} alt={boss.name} fill priority sizes="(max-width: 760px) 100vw, 480px" /><span className="boss-art-vignette" />{boss.badgeIcon && <span className="boss-journal-badge"><Image src={boss.badgeIcon} alt="" fill sizes="96px" /></span>}<div className="journal-boss-level"><Skull /><span><small>{kindLabel[boss.kind]}</small><b>??</b></span></div></div>
          <div className="boss-journal-summary">
            <div className="boss-nameplate"><p>{boss.kind === "lair" ? "TIDEBOUND GROTTO" : boss.zone.toUpperCase()}</p><h1>{boss.name}</h1><span>{boss.title}</span></div>
            <p className="boss-summary">{boss.summary}</p>
            <div className="boss-facts"><div><MapPin /><span><small>{copy.location}</small><strong>{boss.zone}</strong></span></div><div><UsersRound /><span><small>{copy.group}</small><strong>{boss.composition.size}</strong></span></div><div><Clock3 /><span><small>{copy.lockout}</small><strong>{boss.reset}</strong></span></div></div>
            <div className="boss-danger-strip"><span>{copy.fightSummary}</span>{boss.mechanics.slice(0,3).map((m) => { const tag = m.tags?.[0] ?? m.action; return <b key={m.name} className={`action-tag action-${tag.toLowerCase().replaceAll("_", "-")}`}>{tag}</b>; })}</div>
            {boss.sourceUrl ? <div className="boss-source-strip"><ShieldCheck /><span>{copy.verified} {boss.lastVerifiedAt}</span><a href={boss.sourceUrl} rel="noreferrer">{copy.strategySource} <ExternalLink /></a></div> : null}
          </div>
        </header>

        <nav className="guide-tabs" aria-label={copy.sectionsLabel}><a href="#location">{copy.locationTab}</a><a href="#abilities">{copy.abilitiesTab} <b>{boss.mechanics.length}</b></a><a href="#position">{copy.positionTab}</a><a href="#group">{copy.groupTab}</a><a href="#difficulty">{copy.difficultyTab}</a><a href="#loot">{copy.lootTab} <b>{boss.loot.length}</b></a></nav>

        <div className="guide-layout">
          <aside className="guide-rail"><div><small>{copy.quickAnswer}</small>{boss.mechanics.slice(0,4).map((m) => <a href={`#spell-${m.name.toLowerCase().replaceAll(" ", "-")}`} key={m.name}><Image src={m.icon} alt="" width={34} height={34} /><span><b>{m.action}</b>{m.name}</span></a>)}</div><Link href={`${prefix}/wow/lairs/${nextBoss.slug}`}><small>{copy.next}</small><strong>{nextBoss.name}</strong><ArrowRight /></Link></aside>

          <div className="guide-main">
            <section id="location" className="guide-section location-section" data-reveal>
              <header><span className="section-number"><Navigation /><b>01</b></span><div><small>{copy.locationEyebrow}</small><h2>{copy.find} {boss.name}</h2></div></header>
              <div className="location-layout"><div className="full-map"><Image src={boss.map} alt={`${copy.mapAlt} ${boss.zone}: ${boss.coordinates}`} fill sizes="(max-width:760px) 100vw, 620px" /><span className="map-pin-pulse"><MapPin /></span></div><div className="farm-panel"><h3>{boss.kind === "dungeon" ? copy.dungeonFarm : boss.kind === "delve" ? copy.delveFarm : copy.weeklyFarm}</h3><dl><div><dt>{copy.access}</dt><dd>{boss.farm.access}</dd></div><div><dt>{copy.lockout}</dt><dd>{boss.farm.lockout}</dd></div><div><dt>{copy.bestLoot}</dt><dd>{boss.farm.best}</dd></div></dl>{boss.farm.waypoint && <CopyWaypointButton waypoint={boss.farm.waypoint} locale={locale} />}</div></div>
            </section>

            <section id="abilities" className="guide-section" data-reveal>
              <header><span className="section-number"><BookOpen /><b>02</b></span><div><small>ENCOUNTER JOURNAL</small><h2>{copy.abilities}</h2></div></header>
              <div className="ability-list">{boss.mechanics.map((mechanic) => <article id={`spell-${mechanic.name.toLowerCase().replaceAll(" ", "-")}`} key={mechanic.name} data-reactive className={`ability-row tone-${mechanic.tone}`}>
                <div className="spell-icon"><Image src={mechanic.icon} alt="" width={52} height={52} /><span /></div>
                <div className="spell-copy">
                  <div><h3>{mechanic.name}</h3><span>{mechanic.castBy ? `${copy.casts}: ${mechanic.castBy}` : mechanic.role}{mechanic.spellId ? ` · Spell ID ${mechanic.spellId}` : ` · ${copy.spellUnverified}`}</span></div>
                  <p>{mechanic.description}</p>
                  <strong className="mechanic-response"><span className="mechanic-tag-list">{(mechanic.tags ?? [mechanic.action]).map((tag) => <b key={tag} className={`action-tag action-${tag.toLowerCase().replaceAll("_", "-")}`}>{tag}</b>)}</span><span>{actionLabel[(mechanic.tags ?? [mechanic.action])[0]]}: {mechanic.response}</span></strong>
                  <small className="mechanic-meta">{copy.audience}: {mechanic.role}{mechanic.sourceUrl ? <> · <a href={mechanic.sourceUrl} rel="noreferrer">{copy.source} <ExternalLink /></a></> : null}</small>
                </div>
              </article>)}</div>
            </section>

            <section id="position" className="guide-section" data-reveal>
              <header><span className="section-number"><MapPin /><b>03</b></span><div><small>{copy.positioning}</small><h2>{copy.whereToStand}</h2></div></header>
              <div className="position-grid">{(boss.positioning ?? []).map((item) => <article key={item.label} data-reactive><strong>{item.label}</strong><p>{item.text}</p></article>)}</div>
            </section>

            <section id="group" className="guide-section" data-reveal>
              <header><span className="section-number"><UsersRound /><b>04</b></span><div><small>{copy.recommendedGroup}</small><h2>{boss.kind === "dungeon" || boss.kind === "delve" ? copy.partyComposition : copy.raidComposition}</h2></div></header>
              <div className="role-slots"><article data-reactive><Shield /><div><small>{copy.tanks}</small><strong>{boss.composition.tanks}</strong><p>{copy.tankNote}</p></div></article><article data-reactive><Crown /><div><small>{copy.healers}</small><strong>{boss.composition.healers}</strong><p>{copy.healerNote}</p></div></article><article data-reactive><Swords /><div><small>{copy.damage}</small><strong>{boss.composition.dps}</strong><p>{copy.damageNote}</p></div></article></div>
            </section>

            <section id="difficulty" className="guide-section" data-reveal>
              <header><span className="section-number"><Gauge /><b>05</b></span><div><small>{copy.modeReward}</small><h2>{copy.difficulty}</h2></div></header>
              <div className="difficulty-grid">{boss.difficulties.map((difficulty, index) => {
                const DifficultyIcon = difficultyIcons[index] ?? Shield;
                return <article key={difficulty.name} data-reactive className={index === boss.difficulties.length - 1 ? "top" : ""}><span><DifficultyIcon /><small>0{index+1}</small></span><h3>{difficulty.name}</h3><p>{difficulty.note}</p><dl><div><dt>{copy.group}</dt><dd>{difficulty.group}</dd></div><div><dt>{copy.reward}</dt><dd>{difficulty.reward}</dd></div></dl></article>;
              })}</div>
            </section>

            <section id="loot" className="guide-section loot-section" data-reveal>
              <header><span className="section-number"><Gem /><b>06</b></span><div><small>{copy.lootTable}</small><h2>{copy.whatToFarm}</h2></div></header>
              <div className="loot-table-wrap"><table><thead><tr><th>{copy.item}</th><th>Item ID</th><th>{copy.slotType}</th><th>{copy.stats}</th><th>{copy.difficultyIlvl}</th><th>{copy.chance}</th></tr></thead><tbody>{boss.loot.map((item,index)=><tr key={item.name} data-reactive><td><span className={`loot-icon quality-${index%3}`}><Image src={getLootIcon(item.name)} alt="" fill sizes="34px" /></span>{item.itemId ? <a href={`https://www.wowhead.com/item=${item.itemId}`} rel="noreferrer"><strong>{item.name}</strong><ExternalLink /></a> : <strong>{item.name}</strong>}</td><td><b>{item.itemId ?? copy.unverified}</b></td><td>{item.slot}<small>{item.armor}</small></td><td>{item.stats}</td><td>{item.difficulty ?? "—"}<small>{item.itemLevel ? `ilvl ${item.itemLevel}` : copy.ilvlUnverified}</small></td><td><b className="chance-unknown">{copy.exactChanceUnknown}</b></td></tr>)}</tbody></table>{boss.sourceUrl ? <p className="loot-source-note"><ShieldCheck /> {copy.lootVerified} {boss.lastVerifiedAt} · <a href={boss.sourceUrl} rel="noreferrer">{copy.source} <ExternalLink /></a> · chanceStatus: unknown</p> : null}</div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
