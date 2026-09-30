import Link from "next/link";
import { ArrowLeft, Database, Gem, MapPin, Sparkles, Star, Swords } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformMotion } from "@/components/platform/home/PlatformMotion";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import { OptimizedResilientImage } from "@/components/media/OptimizedResilientImage";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import type { Lang } from "@/lib/i18n";
import type { GenshinDetailRecord, GenshinEntityDetail, GenshinEntityKind } from "@/lib/games/genshin/detail";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import styles from "./genshinEntity.module.css";

const text = {
  en: { back: "Genshin command center", source: "Live PostgreSQL catalog", overview: "Overview", records: "Database records", talents: "Talents", constellations: "Constellations", refinements: "Refinements", pieces: "Artifact pieces", sources: "Acquisition sources", empty: "No additional records in this release", id: "Game ID" },
  ru: { back: "Командный центр Genshin", source: "Живой каталог PostgreSQL", overview: "Обзор", records: "Записи базы", talents: "Таланты", constellations: "Созвездия", refinements: "Пробуждения", pieces: "Части набора", sources: "Источники получения", empty: "В этом релизе дополнительных записей нет", id: "ID в игре" },
};

function titleFor(kind: GenshinEntityKind, lang: Lang) {
  const titles = { characters: ["Character intelligence", "Досье персонажа"], weapons: ["Weapon intelligence", "Досье оружия"], "artifact-sets": ["Artifact intelligence", "Досье артефакта"] } as const;
  return titles[kind][lang === "ru" ? 1 : 0];
}

function primaryRecords(entity: GenshinEntityDetail, kind: GenshinEntityKind) {
  if (kind === "characters") return entity.talents ?? [];
  if (kind === "weapons") return entity.refinements ?? [];
  return entity.pieces ?? [];
}

function secondaryRecords(entity: GenshinEntityDetail, kind: GenshinEntityKind) {
  if (kind === "characters") return entity.constellations ?? [];
  if (kind === "artifact-sets") return entity.sources ?? [];
  return [];
}

function recordTitle(record: GenshinDetailRecord) {
  return String(record.name ?? record.kind ?? record.slot ?? "Record");
}

function recordDescription(record: GenshinDetailRecord) {
  return String(record.description ?? record.note ?? record.region ?? "");
}

export function GenshinEntityPage({ home, entity, kind, lang }: { home: PlatformHomeData; entity: GenshinEntityDetail; kind: GenshinEntityKind; lang: Lang }) {
  const t = text[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const primary = primaryRecords(entity, kind);
  const secondary = secondaryRecords(entity, kind);
  const rarity = entity.rarity ? `${entity.rarity}★` : entity.minRarity && entity.maxRarity ? `${entity.minRarity}–${entity.maxRarity}★` : "—";
  const description = entity.description || entity.passiveDescription || entity.fourPieceBonus || entity.twoPieceBonus || entity.title || "";
  const metrics = [
    [t.id, entity.externalId],
    [lang === "ru" ? "Редкость" : "Rarity", rarity],
    [lang === "ru" ? "Тип" : "Type", entity.weaponType || entity.element || (kind === "artifact-sets" ? "Artifact Set" : "Character")],
    [lang === "ru" ? "Регион" : "Region", entity.region || entity.secondaryStat || (entity.baseAttack ? String(entity.baseAttack) : "—")],
  ];
  const sectionNames = kind === "characters" ? [t.talents, t.constellations] : kind === "weapons" ? [t.refinements, ""] : [t.pieces, t.sources];

  return <div className={`${homeStyles.page} ${styles.shell}`} data-platform-home data-game="genshin">
    <PlatformMotion />
    <PlatformAtmosphere accent="#b568ef" />
    <PlatformHeader data={home} lang={lang} active="game" scopeLabel="Genshin Impact" />
    <main className={styles.page}>
      <Link className={styles.back} href={`${prefix}/genshin`}><ArrowLeft />{t.back}</Link>
      <section className={styles.hero} data-reveal>
        <div className={styles.portrait}>{entity.portraitUrl || entity.iconUrl ? <OptimizedResilientImage src={entity.portraitUrl || entity.iconUrl} alt="" width={520} height={620} sizes="(max-width: 620px) 150px, (max-width: 900px) 185px, 260px" quality={75} loading="eager" fetchPriority="high" fallback={<Sparkles />} /> : <Sparkles />}</div>
        <div className={styles.heroCopy}>
          <span><Database />{t.source}</span>
          <small>{titleFor(kind, lang)}</small>
          <h1>{entity.name}</h1>
          {entity.title ? <h2>{entity.title}</h2> : null}
          <p>{description}</p>
          <div className={styles.badges}><b><Star />{rarity}</b>{entity.element ? <b><Sparkles />{entity.element}</b> : null}{entity.weaponType ? <b><Swords />{entity.weaponType}</b> : null}{entity.region ? <b><MapPin />{entity.region}</b> : null}</div>
        </div>
        <div className={styles.orbit} aria-hidden="true"><i /><i /><Gem /></div>
      </section>

      <section className={styles.metrics} aria-label={t.overview} data-reveal>
        {metrics.map(([label, value]) => <div key={String(label)}><small>{label}</small><strong>{value}</strong></div>)}
      </section>

      <section className={styles.catalog} data-reveal>
        <header><div><span>{t.records}</span><h2>{sectionNames[0]}</h2></div><b>{primary.length}</b></header>
        {primary.length ? <div className={styles.grid}>{primary.map((record, index) => <article key={String(record.id ?? `${recordTitle(record)}-${index}`)}>
          <div className={styles.recordIcon}>{record.iconUrl ? <OptimizedResilientImage src={record.iconUrl} alt="" width={96} height={96} sizes="48px" quality={75} loading="lazy" fallback={<Gem />} /> : <Gem />}</div>
          <small>{String(record.kind ?? record.slot ?? (record.position ? `C${record.position}` : kind))}</small>
          <h3>{recordTitle(record)}</h3><p>{recordDescription(record)}</p>
        </article>)}</div> : <p className={styles.empty}>{t.empty}</p>}
      </section>

      {sectionNames[1] ? <section className={styles.catalog} data-reveal>
        <header><div><span>{t.records}</span><h2>{sectionNames[1]}</h2></div><b>{secondary.length}</b></header>
        {secondary.length ? <div className={styles.grid}>{secondary.map((record, index) => <article key={String(record.id ?? `${recordTitle(record)}-${index}`)}>
          <div className={styles.recordIcon}>{record.iconUrl ? <OptimizedResilientImage src={record.iconUrl} alt="" width={96} height={96} sizes="48px" quality={75} loading="lazy" fallback={<Sparkles />} /> : <Sparkles />}</div>
          <small>{record.position ? `C${record.position}` : String(record.sourceKind ?? record.kind ?? "source")}</small>
          <h3>{recordTitle(record)}</h3><p>{recordDescription(record)}</p>
        </article>)}</div> : <p className={styles.empty}>{t.empty}</p>}
      </section> : null}
    </main>
  </div>;
}
