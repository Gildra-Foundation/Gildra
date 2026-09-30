import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck, ChevronRight, Crown, ImageIcon, MapPin, ShieldCheck, Skull } from "lucide-react";
import { midnightLairEncounters } from "@/data/wow/midnight-lairs";
import { JournalMotion } from "./JournalMotion";
import { getLairMedia } from "./lairMedia";

export function LairsHub({ locale = "ru" }: { locale?: "ru" | "en" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const lair = midnightLairEncounters.find((encounter) => encounter.kind === "lair")!;
  const worldBosses = midnightLairEncounters.filter((encounter) => encounter.kind === "world-boss");
  const copy = locale === "ru" ? {
    title: "Логова и мировые боссы",
    subtitle: "Пять подтверждённых записей Midnight Season 2. Визуальный журнал восстановлен; неподтверждённые тактики и добыча не публикуются.",
    current: "ТЕКУЩЕЕ ЛОГОВО",
    verifiedRoster: "Название и тип подтверждены источником",
    lairType: "БОСС ЛОГОВА",
    sourceImage: "ИЗОБРАЖЕНИЕ ЛОКАЦИИ",
    locationReference: "Визуальный ориентир",
    sourceTracked: "Источник указан",
    patch: "ПАТЧ",
    season: "СЕЗОН",
    status: "СТАТУС",
    live: "Live",
    verified: "ПОСЛЕДНЯЯ ПРОВЕРКА",
    open: "Открыть запись",
    worldBosses: "МИРОВЫЕ БОССЫ",
    worldCaption: "Четыре подтверждённые записи Season 2",
    worldType: "WORLD BOSS",
    identityOnly: "Подтверждена идентичность",
    checked: "Проверено",
    map: "КАРТА",
    verification: "СТАТУС ПУБЛИКАЦИИ",
    verificationCaption: "Что подтверждено и что намеренно скрыто",
    names: "Идентичности",
    namesText: "Названия и типы активностей взяты из официального анонса Blizzard.",
    media: "Медиа",
    mediaText: "Скриншоты боссов и локаций имеют отдельный источник и дату проверки.",
    strategy: "Тактика",
    strategyText: "Опубликованные механики содержат Spell ID, исполнителя, действие и источник.",
    loot: "Добыча",
    lootText: "Опубликованные предметы содержат item ID и честный chanceStatus: unknown.",
    official: "Официальный источник Blizzard",
    mediaSource: "Источник изображений",
  } : {
    title: "Lairs and world bosses",
    subtitle: "Five source-confirmed Midnight Season 2 records. The visual journal is restored; unverified strategy and loot remain unpublished.",
    current: "CURRENT LAIR",
    verifiedRoster: "Name and activity type are source-confirmed",
    lairType: "LAIR BOSS",
    sourceImage: "LOCATION IMAGE",
    locationReference: "Visual location reference",
    sourceTracked: "Source tracked",
    patch: "PATCH",
    season: "SEASON",
    status: "STATUS",
    live: "Live",
    verified: "LAST VERIFIED",
    open: "Open record",
    worldBosses: "WORLD BOSSES",
    worldCaption: "Four source-confirmed Season 2 records",
    worldType: "WORLD BOSS",
    identityOnly: "Identity verified",
    checked: "Verified",
    map: "MAP",
    verification: "PUBLICATION STATUS",
    verificationCaption: "What is confirmed and what remains intentionally withheld",
    names: "Identities",
    namesText: "Names and activity types come from Blizzard's official announcement.",
    media: "Media",
    mediaText: "Boss and location screenshots carry a separate source and verification date.",
    strategy: "Strategy",
    strategyText: "Published mechanics include the Spell ID, caster, required response, and source.",
    loot: "Loot",
    lootText: "Published loot includes item IDs and an honest chanceStatus: unknown.",
    official: "Official Blizzard source",
    mediaSource: "Image source",
  };
  const lairMedia = getLairMedia(lair.slug)!;
  return (
    <main className="lairs-page wow-journal" data-lairs-root>
      <JournalMotion />
      <header className="lairs-header lairs-shell" data-reveal>
        <nav aria-label={locale === "ru" ? "Хлебные крошки" : "Breadcrumbs"}><Link href={`${prefix}/wow`}>World of Warcraft</Link><ChevronRight /><span>Midnight</span><ChevronRight /><b>Lairs</b></nav>
        <div className="lairs-title-row">
          <span className="lairs-title-crest"><Skull /></span>
          <div><p>MIDNIGHT · SEASON 2</p><h1>{copy.title}</h1><span>{copy.subtitle}</span></div>
          <div className="lairs-season"><small>{copy.season}</small><strong>02</strong><em>Patch 12.1</em></div>
        </div>
      </header>

      <nav className="lairs-catalog-nav lairs-shell" aria-label={locale === "ru" ? "Разделы журнала" : "Journal sections"} data-reveal>
        <a href="#current-lair"><Crown /><span>Lair</span><b>01</b></a>
        <a href="#world-bosses"><Skull /><span>World bosses</span><b>04</b></a>
        <a href="#verification"><ShieldCheck /><span>{copy.verification}</span><b>04</b></a>
        <a href={lair.sourceUrl} rel="noreferrer"><BookOpen /><span>{copy.official}</span><b>↗</b></a>
        <strong><small>{locale === "ru" ? "ВСЕГО" : "TOTAL"}</small>05</strong>
      </nav>

      <section id="current-lair" className="lairs-current lairs-shell" aria-labelledby="current-lair-name" data-reveal>
        <div className="lairs-block-title"><div><span className="live-dot" />{copy.current}</div><p>{copy.verifiedRoster}</p></div>
        <article className="current-lair-card" data-reactive style={{ "--boss-accent": lairMedia.accent } as React.CSSProperties}>
          <Link className="current-boss-art" href={`${prefix}/wow/lairs/${lair.slug}`}>
            <Image src={lairMedia.portrait} alt={lair.name} fill priority sizes="(max-width: 800px) 100vw, 46vw" />
            <span className="boss-art-vignette" /><span className="boss-type"><Crown /> {copy.lairType}</span>
            <div><small>MIDNIGHT · SEASON 2</small><h2 id="current-lair-name">{lair.name}</h2><p>{copy.identityOnly}</p></div>
          </Link>
          <div className="current-lair-info">
            <div className="lair-map-card"><Image src={lairMedia.map} alt={`${copy.sourceImage}: ${lair.name}`} fill sizes="(max-width: 800px) 100vw, 36vw" /><span className="map-pin-pulse"><MapPin /></span><div><small>{copy.sourceImage}</small><strong>{copy.locationReference}</strong><b>{copy.sourceTracked}</b></div></div>
            <div className="current-stats"><span><BookOpen /><small>{copy.patch}</small><strong>{lair.patch}</strong></span><span><CalendarCheck /><small>{copy.season}</small><strong>2</strong></span><span><ShieldCheck /><small>{copy.status}</small><strong>{copy.live}</strong></span></div>
            <div className="current-actions"><div><small>{copy.verified}</small><strong>{lair.lastVerifiedAt}</strong></div><Link href={`${prefix}/wow/lairs/${lair.slug}`}>{copy.open} <ArrowRight /></Link></div>
          </div>
        </article>
      </section>

      <section id="world-bosses" className="lairs-roster lairs-shell" aria-labelledby="world-bosses-title" data-reveal>
        <div className="lairs-block-title"><div><Skull /> {copy.worldBosses}</div><p id="world-bosses-title">{copy.worldCaption}</p></div>
        <div className="world-boss-grid">{worldBosses.map((encounter) => {
          const media = getLairMedia(encounter.slug)!;
          return <Link key={encounter.id} href={`${prefix}/wow/lairs/${encounter.slug}`} className="world-boss-card" data-reactive style={{ "--boss-accent": media.accent } as React.CSSProperties}>
            <div className="world-boss-art"><Image src={media.portrait} alt={encounter.name} fill sizes="(max-width: 480px) 124px, (max-width: 1050px) 145px, 180px" /><span /><b>{copy.worldType}</b></div>
            <div className="world-boss-body"><small>MIDNIGHT · SEASON 2</small><h2>{encounter.name}</h2><p>{copy.identityOnly}</p><div><span><ShieldCheck /> {copy.checked}: {encounter.lastVerifiedAt}</span></div></div>
            <div className="world-boss-map"><Image src={media.map} alt={`${copy.sourceImage}: ${encounter.name}`} fill sizes="120px" /><span>{copy.map}</span></div><ArrowRight className="world-boss-arrow" />
          </Link>;
        })}</div>
      </section>

      <section id="verification" className="lairs-system lairs-shell" aria-labelledby="verification-title" data-reveal>
        <div className="lairs-block-title"><div><ShieldCheck /> {copy.verification}</div><p id="verification-title">{copy.verificationCaption}</p></div>
        <div className="system-track">
          <article><span><ShieldCheck /><small>01</small></span><div><strong>{copy.names}</strong><p>{copy.namesText}</p></div><b><a href={lair.sourceUrl} rel="noreferrer">Blizzard ↗</a></b></article>
          <article><span><ImageIcon /><small>02</small></span><div><strong>{copy.media}</strong><p>{copy.mediaText}</p></div><b><a href="https://www.icy-veins.com/wow/midnight-world-bosses-guide" rel="noreferrer">{copy.mediaSource} ↗</a></b></article>
          <article><span><BookOpen /><small>03</small></span><div><strong>{copy.strategy}</strong><p>{copy.strategyText}</p></div><b>VERIFIED</b></article>
          <article><span><Crown /><small>04</small></span><div><strong>{copy.loot}</strong><p>{copy.lootText}</p></div><b>VERIFIED</b></article>
        </div>
      </section>
    </main>
  );
}
