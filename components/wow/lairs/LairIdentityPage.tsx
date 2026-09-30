import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarCheck, MapPin, ShieldCheck, Skull } from "lucide-react";
import type { MidnightLairEncounter } from "@/data/wow/midnight-lairs";
import { JournalMotion } from "./JournalMotion";
import { getLairMedia } from "./lairMedia";

export function LairIdentityPage({ encounter, locale }: { encounter: MidnightLairEncounter; locale: "en" | "ru" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const type = encounter.kind === "lair"
    ? (locale === "ru" ? "Логово" : "Lair")
    : (locale === "ru" ? "Мировой босс" : "World boss");
  const media = getLairMedia(encounter.slug)!;
  const statusTitle = locale === "ru" ? "Подтверждена идентичность" : "Identity verified";
  const statusText = locale === "ru"
    ? "Название, тип активности и принадлежность к Midnight Season 2 подтверждены. Тактика, способности, игровые ID и добыча скрыты до отдельной проверки."
    : "The name, activity type, and Midnight Season 2 placement are confirmed. Strategy, abilities, game IDs, and loot remain withheld pending separate verification.";
  return (
    <main className="lair-guide wow-journal" data-lairs-root style={{ "--boss-accent": media.accent } as React.CSSProperties}>
      <JournalMotion />
      <div className="lair-guide-shell lairs-shell">
        <nav className="guide-breadcrumb"><Link href={`${prefix}/wow/lairs`}><ArrowLeft /> {locale === "ru" ? "Логова и мировые боссы" : "Lairs and world bosses"}</Link><span>/</span><b>{encounter.name}</b></nav>
        <header className="boss-journal-head" data-reveal data-reactive>
          <div className="boss-journal-art"><Image src={media.portrait} alt={encounter.name} fill priority sizes="(max-width: 760px) 100vw, 480px" /><span className="boss-art-vignette" /><div className="journal-boss-level"><Skull /><span><small>{type.toUpperCase()}</small><b>12.1</b></span></div></div>
          <div className="boss-journal-summary">
            <div className="boss-nameplate"><p>MIDNIGHT · SEASON 2</p><h1>{encounter.name}</h1><span>{type}</span></div>
            <p className="boss-summary">{statusText}</p>
            <div className="boss-facts"><div><BookOpen /><span><small>PATCH</small><strong>{encounter.patch}</strong></span></div><div><CalendarCheck /><span><small>{locale === "ru" ? "ПРОВЕРЕНО" : "VERIFIED"}</small><strong>{encounter.lastVerifiedAt}</strong></span></div><div><ShieldCheck /><span><small>STATUS</small><strong>{statusTitle}</strong></span></div></div>
          </div>
        </header>
        <section className="guide-section location-section" data-reveal>
          <header><span className="section-number"><MapPin /><b>01</b></span><div><small>{locale === "ru" ? "ВИЗУАЛЬНЫЙ ОРИЕНТИР" : "VISUAL REFERENCE"}</small><h2>{locale === "ru" ? "Изображение локации" : "Location image"}</h2></div></header>
          <div className="location-layout"><div className="full-map"><Image src={media.map} alt={`${locale === "ru" ? "Изображение локации" : "Location image"}: ${encounter.name}`} fill sizes="(max-width:760px) 100vw, 820px" /></div><aside className="farm-panel" role="note"><h3>{statusTitle}</h3><p>{statusText}</p><p><a href={encounter.sourceUrl} rel="noreferrer">{locale === "ru" ? "Официальный источник Blizzard" : "Official Blizzard source"} ↗</a></p><p><a href="https://www.icy-veins.com/wow/midnight-world-bosses-guide" rel="noreferrer">{locale === "ru" ? "Источник изображений" : "Image source"} ↗</a></p></aside></div>
        </section>
      </div>
    </main>
  );
}
