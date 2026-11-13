import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtlasSection } from "@/components/atlas";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import detail from "@/components/database/entityDetail.module.css";
import { LibraryRecordCard } from "@/components/library/LibraryRecordCard";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { ResilientImage } from "@/components/media/ResilientImage";
import { MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { FOREVER_TYPES, foreverIconUrl, foreverRecordPath, isForeverType, type ForeverLocale, type ForeverRecord, type ForeverRelation, type ForeverSummary, type ForeverType } from "@/lib/forever/database/contract";
import { foreverRecord, foreverSearch, type ForeverQuery } from "@/lib/forever/database/server";
import { professionBySlug } from "@/lib/forever/guides/professions";
import { p } from "@/lib/i18n-paths";
import { ForeverFrame } from "../ForeverFrame";
import { FOREVER_KIT, ForeverEmpty, ForeverFilters, ForeverHero, ForeverIcon, ForeverLevel, ForeverList, ForeverListRow, ForeverPager, ForeverPanel, ForeverRow, ForeverRows, ForeverSearch, ForeverSelect, ForeverStack, ForeverTabs, foreverIconFrame, foreverPanelStyles, sharedCopy } from "../shared";
import { libraryCopy } from "./libraryCopy";
import { libraryTypeIcons } from "./libraryTypes";
import { RecordTooltip, hasTooltip, typeSymbol } from "./RecordTooltip";
import { slotNames } from "./slotNames";
import styles from "./library.module.css";

const base = (lang: ForeverLocale) => p(lang, "/wow/forever/library");
const typeUrl = (lang: ForeverLocale, type: ForeverType) => `${base(lang)}?type=${type}`;
const shownName = (record: Pick<ForeverSummary, "name">, lang: ForeverLocale) => record.name[lang] || record.name.en;
const qualityColour = (quality?: number) => (quality !== undefined ? itemQualityColors[quality as keyof typeof itemQualityColors] : undefined);
/** The highest level a level filter of the type can ask for. */
const LEVEL_CAP: Record<ForeverType, number> = { item: 100, spell: 100, npc: 63, quest: 60, recipe: 60 };

/** The quiet line of a record: slot and requirement of an item, the level of a creature or a quest, the profession of a recipe. */
function recordLine(record: ForeverSummary, lang: ForeverLocale) {
  const t = libraryCopy[lang], card = libraryCardCopy[lang];
  // A fact stays whole when the line wraps: «Req. level 17» never parts from its number.
  const whole = (fact: string) => fact.replaceAll(" ", "\u00a0");
  const required = record.requiredLevel && record.requiredLevel > 1 ? whole(card.requiredLevel(record.requiredLevel)) : null;
  if (record.type === "item") return [record.slotId ? whole(slotNames[lang][record.slotId]) : null, required];
  if (record.type === "recipe") return [record.category ? t.professions[record.category as keyof typeof t.professions] ?? null : null];
  return [record.level ? whole(t.level(record.level)) : null, required];
}

/** /wow/forever/library without a query: the search of the whole library and the way into its five record types. */
async function LibraryLanding({ lang }: { lang: ForeverLocale }) {
  const t = libraryCopy[lang];
  const count = new Intl.NumberFormat(libraryCardCopy[lang].numberLocale);
  const totals = await Promise.all(FOREVER_TYPES.map(async type => (await foreverSearch({ type })).total));
  return <ForeverFrame lang={lang} page="library">
    <ForeverHero lang={lang} trail={[{ label: t.crumb }]} title={t.title} actions={
      <ForeverPanel as="section" className={styles.searchPanel} aria-label={t.title}>
        <ForeverFilters lang={lang} action={base(lang)} search={<ForeverSearch name="q" label={t.search} placeholder={t.hints.all} />} />
      </ForeverPanel>} />
    <nav aria-label={t.type}>
      <ul className={styles.types} data-forever-cascade="">
        {FOREVER_TYPES.map((type, index) => <li key={type}>
          <ForeverPanel as="article" className={styles.type}>
            <ForeverIcon src={libraryTypeIcons[type]} size={64} />
            <h2 className={styles.typeName}><Link href={typeUrl(lang, type)} prefetch={false}>{t.types[type]}</Link></h2>
            <p className={styles.typeNote}>{t.typeNotes[type]}</p>
            <p className={styles.typeCount}>{count.format(totals[index])}</p>
          </ForeverPanel>
        </li>)}
      </ul>
    </nav>
  </ForeverFrame>;
}

export async function LibraryPage({ lang, query }: { lang: ForeverLocale; query: ForeverQuery }) {
  if (!Object.values(query).some(Boolean)) return <LibraryLanding lang={lang} />;
  const t = libraryCopy[lang];
  // A typed name is counted in every record type: the tabs show where it was found, and a search
  // from the first page (no type yet) opens the type that has the most of it.
  const name = query.q?.trim();
  const found = name ? Object.fromEntries(await Promise.all(FOREVER_TYPES.map(async entry => [entry, (await foreverSearch({ type: entry, q: name })).total] as const))) as Record<ForeverType, number> : undefined;
  const result = await foreverSearch({ ...query, type: isForeverType(query.type) ? query.type : found ? FOREVER_TYPES.reduce((best, entry) => (found[entry] > found[best] ? entry : best)) : undefined });
  const type = result.type;
  const tabUrl = (entry: ForeverType) => (name ? `${typeUrl(lang, entry)}&${new URLSearchParams({ q: name })}` : typeUrl(lang, entry));
  const pageUrl = (page: number) => {
    const params = new URLSearchParams({ type });
    for (const key of ["q", "quality", "category", "minLevel", "maxLevel", "related", "edge"] as const) if (query[key]) params.set(key, query[key]);
    if (page > 1) params.set("page", String(page));
    return `${base(lang)}?${params}`;
  };
  const filtered = [query.q, query.quality, query.category, query.minLevel, query.maxLevel, query.related].some(Boolean);
  // A list opened from a record («Show all»): the heading says whose relation it is.
  const [sourceType, sourceId] = (query.related ?? "").split(":");
  const source = isForeverType(sourceType) && /^[1-9]\d{0,9}$/.test(sourceId ?? "") ? await foreverRecord(sourceType, Number(sourceId)) : null;
  const edge = t.edges[query.edge as keyof typeof t.edges];
  const levels = type === "recipe" ? [] : [
    <ForeverLevel key="min" name="minLevel" label={t.min} max={LEVEL_CAP[type]} defaultValue={query.minLevel} />,
    <ForeverLevel key="max" name="maxLevel" label={t.max} max={LEVEL_CAP[type]} defaultValue={query.maxLevel} />,
  ];
  return <ForeverFrame lang={lang} page="library">
    <ForeverHero lang={lang} trail={[{ label: t.crumb, href: base(lang) }, { label: t.types[type] }]}
      crest={<Image src={libraryTypeIcons[type]} alt="" width={64} height={64} unoptimized />}
      title={t.types[type]} lede={source ? [shownName(source, lang), edge].filter(Boolean).join(" · ") : t.typeNotes[type]} />
    <ForeverTabs label={t.type} tabs={FOREVER_TYPES.map(entry => ({ href: tabUrl(entry), label: t.types[entry], current: entry === type, count: found?.[entry] }))} />
    <ForeverStack>
      <ForeverPanel>
        <ForeverFilters lang={lang} action={base(lang)} hidden={{ type, related: query.related, edge: query.edge }} reset={filtered ? typeUrl(lang, type) : undefined}
          search={<ForeverSearch name="q" label={t.search} placeholder={t.hints[type]} defaultValue={query.q} />}>
          {type === "item" ? <ForeverSelect name="quality" label={t.quality} defaultValue={query.quality ?? ""} options={[{ value: "", label: t.all }, ...t.qualities.map((label, value) => ({ value, label }))]} /> : null}
          {type === "recipe" ? <ForeverSelect name="category" label={t.profession} defaultValue={query.category ?? ""}
            options={[{ value: "", label: t.all }, ...result.categories.map(category => ({ value: category, label: t.professions[category as keyof typeof t.professions] || category }))]} /> : null}
          {levels}
        </ForeverFilters>
        {/* The filter bar above already offers «Reset». */}
        {result.records.length ? null : <ForeverEmpty lang={lang}>{filtered ? sharedCopy[lang].emptyText : undefined}</ForeverEmpty>}
      </ForeverPanel>
      {result.records.length === 0 ? null : type === "npc" || type === "quest"
        // Creatures and quests have no icon of their own: glass rows under the sign of their type.
        ? <ForeverRows label={t.types[type]} className={styles.signs}>
          {result.records.map(record => <ForeverRow key={record.id} href={foreverRecordPath(record.type, record.id, lang)} sign={<CatalogGlyph symbol={typeSymbol(record.type)} />}
            title={shownName(record, lang)} note={recordLine(record, lang).filter(Boolean).join(" · ") || undefined} />)}
        </ForeverRows>
        : <ul className={styles.cards} aria-label={t.types[type]} data-forever-cascade="">
          {result.records.map(record => <LibraryRecordCard key={record.id} id={`forever:${record.type}:${record.id}`} href={foreverRecordPath(record.type, record.id, lang)}
            name={shownName(record, lang)} lang={lang} layout="cards" iconUrl={foreverIconUrl(record.icon)} iconSymbol={typeSymbol(record.type)} quality={record.quality}
            itemLevel={record.type === "item" ? record.level : undefined} slot={recordLine(record, lang).filter(Boolean).join(" · ") || undefined} facts={[]} iconFrameStyle={foreverIconFrame(54)} />)}
        </ul>}
      <ForeverPager lang={lang} label={t.types[type]} page={result.page} pages={result.pages}
        prev={result.page > 1 ? pageUrl(result.page - 1) : undefined} next={result.page < result.pages ? pageUrl(result.page + 1) : undefined} />
    </ForeverStack>
  </ForeverFrame>;
}

type RelatedGroup = { label: string; type: ForeverType; kinds: Set<string>; edges: ForeverRelation[] };

/** Relations of a record as lists: one list per heading, a record once in a list. */
function relatedGroups(record: ForeverRecord, lang: ForeverLocale) {
  const t = libraryCopy[lang];
  const groups = new Map<string, RelatedGroup>();
  for (const edge of record.relations) {
    const label = t.edges[edge.kind as keyof typeof t.edges] || t.types[edge.type];
    const key = `${label}|${edge.type}`;
    const group = groups.get(key) ?? { label, type: edge.type, kinds: new Set<string>(), edges: [] };
    group.kinds.add(edge.kind);
    if (!group.edges.some(entry => entry.id === edge.id)) group.edges.push(edge);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const RELATED_SHOWN = 20;

/** One related record as a line: its icon, the name in the quality colour, where it is or what it asks, the amount. */
function RelatedRow({ target, edge, lang }: { target: ForeverRecord; edge: ForeverRelation; lang: ForeverLocale }) {
  const colour = qualityColour(target.quality);
  const note = target.type === "npc" && target.locations?.length ? [target.locations[0], target.level ? libraryCopy[lang].level(target.level) : null]
    : [target.type === "item" && target.level ? libraryCardCopy[lang].levelShort(target.level) : null, ...recordLine(target, lang)];
  const line = note.filter(Boolean).join(" · ");
  const amount = edge.quantityRange ? edge.quantityRange.join("–") : edge.quantity;
  return <ForeverListRow href={foreverRecordPath(target.type, target.id, lang)}
    icon={target.icon ? <span className={styles.rowIcon} style={colour ? { "--material-icon-edge": colour.frame } as CSSProperties : undefined}><ForeverIcon src={foreverIconUrl(target.icon)!} size={44} /></span> : undefined}
    title={<b className={styles.rowName} style={colour ? { color: colour.text } : undefined}>{shownName(target, lang)}</b>}
    note={line || undefined} values={amount ? <span>× {amount}</span> : undefined} />;
}

export async function LibraryRecordPage({ lang, type, id }: { lang: ForeverLocale; type: string; id: string }) {
  if (!isForeverType(type) || !/^[1-9]\d{0,9}$/.test(id)) notFound();
  const record = await foreverRecord(type, Number(id));
  if (!record) notFound();
  const t = libraryCopy[lang];
  const name = shownName(record, lang);
  const groups = await Promise.all(relatedGroups(record, lang).map(async group => ({
    ...group,
    records: (await Promise.all(group.edges.slice(0, RELATED_SHOWN).map(async edge => ({ edge, target: await foreverRecord(edge.type, edge.id) })))).filter((row): row is { edge: ForeverRelation; target: ForeverRecord } => Boolean(row.target)),
  })));
  const shown = groups.filter(group => group.records.length > 0);
  const colour = qualityColour(record.quality);
  const text = (key: string) => (record.facts[key] ? String(record.facts[key]) : undefined);
  // The label line: quality in its colour and the slot of an item, rank and school of a spell, the level, the profession.
  const label: ReactNode[] = [
    colour && record.quality !== undefined ? <span key="quality" className={detail.qualityValue} style={{ "--record-quality-text": colour.text } as CSSProperties}>{t.qualities[record.quality]}</span> : null,
    record.type === "item" && record.slotId ? slotNames[lang][record.slotId] : null,
    record.type === "spell" ? text("rank") : null,
    record.type === "spell" ? text("school") : null,
    record.type === "npc" || record.type === "quest" ? (record.level ? t.level(record.level) : null) : null,
    record.type === "recipe" && record.category ? t.professions[record.category as keyof typeof t.professions] : null,
  ].filter(Boolean);
  // A recipe of the library is the same recipe on its profession's page.
  const craft = record.type === "recipe" && record.category && professionBySlug(record.category)?.recipes.some(recipe => recipe.id === record.id)
    ? p(lang, `/wow/forever/professions/${record.category}/${record.id}`) : undefined;
  const quality = colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined;
  return <ForeverFrame lang={lang} page="library">
    <ForeverHero lang={lang}
      trail={[{ label: t.crumb, href: base(lang) }, { label: t.types[type], href: typeUrl(lang, type) }, { label: name }]}
      eyebrow={label.length ? <span className={detail.label}>{label.map((part, index) => <span key={index}>{part}</span>)}</span> : undefined}
      title={<span className={detail.heroTitle} style={quality}>
        {/* The record's own icon in the section's frame, the quality on its inner edge: identity, so it stays on phones too. */}
        <span className={`${foreverPanelStyles.iconFrame} ${detail.heroIcon}`} style={foreverIconFrame(112)} aria-hidden="true">
          <ResilientImage src={foreverIconUrl(record.icon)} alt="" width={96} height={96} fallback={<CatalogGlyph symbol={typeSymbol(type)} className={detail.glyph} />} />
        </span>
        <span className={detail.heroName} data-long={name.length > 34 || undefined}>{name}</span>
      </span>}
      actions={craft ? <MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={craft}>{t.openRecipe}</MaterialLinkButton> : undefined}
      aside={hasTooltip(record, lang) ? <div className={detail.heroSide} data-side="tooltip">
        <ForeverPanel className={detail.tooltipPlaque} style={quality}><RecordTooltip record={record} lang={lang} /></ForeverPanel>
      </div> : undefined} />
    {shown.length > 0 && <AtlasSection id="related" title={t.related}>
      <div className={styles.related} data-count={Math.min(shown.length, 2)} data-forever-cascade="">
        {shown.map(group => {
          const all = group.kinds.size === 1 && group.edges.length > RELATED_SHOWN
            ? `${base(lang)}?${new URLSearchParams({ type: group.type, related: `${type}:${id}`, edge: [...group.kinds][0] })}` : undefined;
          return <ForeverPanel key={`${group.label}|${group.type}`} as="section" title={group.label}>
            <ForeverList label={group.label}>{group.records.map(({ edge, target }) => <RelatedRow key={`${edge.kind}:${target.id}`} target={target} edge={edge} lang={lang} />)}</ForeverList>
            {all ? <a className={foreverPanelStyles.link} href={all}>{t.showAll} {group.edges.length}</a> : null}
          </ForeverPanel>;
        })}
      </div>
    </AtlasSection>}
  </ForeverFrame>;
}
