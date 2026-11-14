import "server-only";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AtlasDisclosure } from "@/components/atlas";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph, TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { CatalogRecordRow } from "@/components/database/CatalogRecordRow";
import { recordFacts } from "@/components/database/TooltipContent";
import { entityDetailCopy, relationTitle, relationshipAttributes } from "@/components/database/entityDetailCopy";
import {
  bossNeighbours, encounterInstance, instanceBosses, itemLevelCell, lootLookups, lootRows, mapLimit, relationGroups, sameName,
  type LootFacts, type LootRow, type RelatedRecord, type Relationship,
} from "@/components/database/recordSections";
import { LibraryHoverPreview } from "@/components/library/LibraryHoverPreview";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { libraryKit } from "@/components/library/libraryKit";
import { materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { getCatalogCategories, getCatalogEntity, getCatalogPage, getCatalogRelationships, type GameEntity } from "@/lib/api/client";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { withCatalogIcon } from "@/lib/games/wow/assets";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { withVariantQuality } from "@/lib/library/recordQuality";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import type { Lang } from "@/lib/i18n";
import styles from "./entityDetail.module.css";
import table from "@/components/library/libraryResults.module.css";
import sections from "./recordSections.module.css";

type Props = { entity: GameEntity; relationships: Relationship[]; lang: Lang };

const ROOT_ID = "record-related";
const PROFESSION_SAMPLE = 12;
const locale = (lang: Lang) => (lang === "ru" ? "ru_RU" as const : "en_US" as const);
const href = (lang: Lang, record: RelatedRecord) => libraryRecordPath(lang, record.type, record.id, record.slug || record.externalId, record.product);
const shownName = (lang: Lang, record: RelatedRecord) => catalogLocaleView({ ...record, name: record.name ?? "" }, lang).name || record.name || `${entityTypeLabel(record.type, lang)} #${record.externalId}`;
const qualityStyle = (quality?: number) => {
  const colour = quality !== undefined ? itemQualityColors[quality as keyof typeof itemQualityColors] : undefined;
  return colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined;
};

/** Relationships of another record (cached like the page); a failed read is an empty list. */
async function relationsOf(id: string, lang: Lang): Promise<Relationship[]> {
  return getCatalogRelationships(id, locale(lang), 100).then((rows) => rows as Relationship[]).catch(() => []);
}

/**
 * Facts of the loot items: item level, quality and slot from one summary read
 * of all items, then the full record of each row that still lacks quality or
 * slot (bounded, a few at a time, short timeout — a slow read leaves the cell empty).
 */
async function lootFacts(relationships: Relationship[], lang: Lang) {
  const items = relationships.filter((entry) => entry.direction === "incoming" && entry.relation === "obtained_from" && entry.entity.type === "item");
  const facts = new Map<string, LootFacts>();
  if (!items.length) return facts;
  const externalIds = Array.from(new Set(items.map((entry) => entry.entity.externalId))).slice(0, 100);
  const summaries = await getCatalogPage({ externalIds, type: "item", locale: locale(lang), limit: 100, timeoutMs: 4000 }).then((page) => page.data).catch(() => []);
  for (const summary of summaries) {
    const slot = summary.highlights?.find((entry) => entry.key === "inventory_type")?.value;
    facts.set(summary.id, { ...(summary.itemLevel ? { itemLevel: summary.itemLevel } : {}), ...(typeof summary.quality === "number" ? { quality: summary.quality } : {}), ...(slot ? { slot } : {}) });
  }
  const draft = lootRows(items, facts);
  const records = await mapLimit(lootLookups(draft), 8, (id) => getCatalogEntity(id, locale(lang), "", false, AbortSignal.timeout(4000)));
  for (const record of records) {
    if (!record) continue;
    const view = withVariantQuality(catalogLocaleView(record, lang));
    const fact = (key: string) => recordFacts(view, lang).find((entry) => entry.key === key)?.value;
    const slotCode = Number(view.tooltip?.blocks.find((block) => String(block.type ?? "") === "slot")?.code);
    const level = Number(fact("itemLevel"));
    facts.set(record.id, {
      ...facts.get(record.id),
      ...(typeof view.quality === "number" ? { quality: view.quality } : {}),
      ...(level > 0 ? { itemLevel: level } : {}),
      ...(slotCode > 0 ? { slotCode, slot: fact("slot") } : {}),
      ...(fact("subclass") ? { kind: fact("subclass") } : {}),
    });
  }
  return facts;
}

/** Where a related boss stands: its instance's name, read from the boss's own relationships. */
async function bossInstances(bosses: RelatedRecord[], lang: Lang) {
  const instances = await mapLimit(bosses.slice(0, 4), 4, async (boss) => encounterInstance(await relationsOf(boss.id, lang)));
  return new Map(bosses.slice(0, 4).map((boss, index) => [boss.id, instances[index]] as const));
}

/** Boss encounters that carry the creature's exact name (the NPC "Ragnaros" and the boss "Ragnaros"). */
async function namesakeBosses(entity: GameEntity, lang: Lang): Promise<RelatedRecord[]> {
  if (!entity.name) return [];
  const page = await getCatalogPage({ locale: locale(lang), product: entity.product, dataset: "encounters", query: entity.name, limit: 12, timeoutMs: 4000 }).catch(() => null);
  return (page?.data ?? []).filter((record) => sameName(record.name, entity.name)).slice(0, 4).map((record) => withCatalogIcon(record, entity.product)) as RelatedRecord[];
}

/** /library/recipes filtered by the profession, when the recipe list has that profession as a filter. */
async function professionRecipesHref(entity: GameEntity, lang: Lang) {
  const categories = await getCatalogCategories(locale(lang), "recipe", entity.product).catch(() => []);
  const category = categories.find((entry) => entry.facet === "profession" && entry.count > 0 && sameName(entry.name, entity.name));
  if (!category) return undefined;
  const query = new URLSearchParams({ facet: category.path });
  if (entity.product !== "wow") query.set("product", entity.product);
  return `${lang === "ru" ? "/ru" : ""}/library/recipes?${query}`;
}

/**
 * Related records of a library record page, laid out by what the record is:
 * a boss gets its loot table (icons, quality colours, slot, type, item levels)
 * and the bosses before and after it; an instance its bosses in order; an item
 * its source with the boss's instance; an NPC the boss of the same name; a
 * profession a link to all its recipes. The rest are the related groups.
 * Rendered inside a Suspense boundary: the hero paints before these reads end.
 */
export async function RecordSections({ entity, relationships: related, lang }: Props) {
  // Related records carry no edition of their own: they stand in the edition of the page's record.
  const relationships = related.map((entry) => ({ ...entry, entity: withCatalogIcon(entry.entity, entity.product) }));
  const copy = entityDetailCopy[lang];
  const short = lang === "ru" ? "ru" : "en";
  let groups = relationGroups(relationships);

  const [loot, instanceRelations, sourceInstances, namesakes, recipesHref] = await Promise.all([
    entity.type === "encounter" ? lootFacts(relationships, lang).then((facts) => lootRows(relationships, facts)) : Promise.resolve([] as LootRow[]),
    entity.type === "encounter" && encounterInstance(relationships) ? relationsOf(encounterInstance(relationships)!.id, lang) : Promise.resolve([] as Relationship[]),
    entity.type === "item"
      ? bossInstances(groups.find((group) => group.key === "outgoing:obtained_from")?.entries.map((entry) => entry.entity).filter((record) => record.type === "encounter") ?? [], lang)
      : Promise.resolve(new Map<string, RelatedRecord | undefined>()),
    entity.type === "creature" ? namesakeBosses(entity, lang) : Promise.resolve([] as RelatedRecord[]),
    entity.type === "profession" ? professionRecipesHref(entity, lang) : Promise.resolve(undefined),
  ]);
  const namesakeInstances = namesakes.length ? await bossInstances(namesakes, lang) : new Map<string, RelatedRecord | undefined>();

  const instance = entity.type === "encounter" ? encounterInstance(relationships) : undefined;
  const neighbours = instance ? bossNeighbours(instanceRelations, entity.id) : { previous: undefined, next: undefined };
  const bosses = entity.type === "instance" ? instanceBosses(relationships) : [];
  // What the dedicated sections show is not repeated as a group.
  if (loot.length) groups = groups.filter((group) => group.key !== "incoming:obtained_from");
  if (instance) groups = groups.filter((group) => group.key !== "outgoing:belongs_to");
  if (bosses.length) groups = groups.filter((group) => group.key !== "incoming:belongs_to");

  const row = (record: RelatedRecord, options: { mixed?: boolean; meta?: string[]; typeLabel?: string } = {}) => (
    <CatalogRecordRow
      key={record.id}
      href={href(lang, record)}
      name={shownName(lang, record)}
      typeLabel={options.typeLabel ?? (options.mixed ? entityTypeLabel(record.type, lang) : undefined)}
      iconUrl={record.iconUrl}
      iconSymbol={TYPE_SYMBOLS[record.type]}
      quality={record.quality}
      meta={options.meta}
      previewId={record.id}
    />
  );

  const bossNav = instance ? (
    <nav className={sections.bossNav} aria-label={copy.bossNav}>
      {neighbours.previous ? (
        <Link className={sections.bossStep} href={href(lang, neighbours.previous)} prefetch={false} rel="prev">
          <ArrowLeft aria-hidden="true" /><span><small>{copy.previousBoss}</small>{shownName(lang, neighbours.previous)}</span>
        </Link>
      ) : <span aria-hidden="true" />}
      <Link className={sections.bossHome} href={href(lang, instance)} prefetch={false}>
        <span className={`${materialStyles.iconFrame} ${sections.bossHomeIcon}`} style={materialIconFrameStyle(libraryKit, 44)} aria-hidden="true">
          <ResilientImage src={instance.iconUrl} alt="" width={36} height={36} loading="lazy" fallback={<CatalogGlyph symbol={TYPE_SYMBOLS.instance} className={styles.glyph} />} />
        </span>
        {shownName(lang, instance)}
      </Link>
      {neighbours.next ? (
        <Link className={`${sections.bossStep} ${sections.bossNext}`} href={href(lang, neighbours.next)} prefetch={false} rel="next">
          <span><small>{copy.nextBoss}</small>{shownName(lang, neighbours.next)}</span><ArrowRight aria-hidden="true" />
        </Link>
      ) : <span aria-hidden="true" />}
    </nav>
  ) : null;

  const lootColumns = (["slot", "kind", "itemLevel"] as const).filter((column) => loot.some((entry) => (column === "itemLevel" ? entry.itemLevels.length : entry[column])));
  const lootTable = loot.length ? (
    <section className={sections.section} aria-labelledby="record-loot">
      <h2 id="record-loot" className={styles.columnTitle}>{copy.loot}</h2>
      <table className={table.table} data-columns={lootColumns.length}>
        <thead>
          <tr>
            <th scope="col" className={table.nameHead}>{copy.columns.item}</th>
            {lootColumns.map((column) => <th key={column} scope="col" className={column === "itemLevel" ? table.numeric : undefined}>{copy.columns[column]}</th>)}
          </tr>
        </thead>
        <tbody>
          {loot.map((entry) => (
            <tr key={entry.id} className={table.row} style={qualityStyle(entry.quality)} data-quality={qualityStyle(entry.quality) ? entry.quality : undefined} data-hover-preview={entry.id} data-hover-icon={entry.iconUrl || undefined}>
              <th scope="row" className={table.nameCell}>
                <div className={table.nameInner}>
                  <span className={`${materialStyles.iconFrame} ${table.icon}`} style={materialIconFrameStyle(libraryKit, 48)} aria-hidden="true">
                    <ResilientImage src={entry.iconUrl} alt="" width={36} height={36} loading="lazy" fallback={<CatalogGlyph symbol={TYPE_SYMBOLS.item} className={table.glyph} />} />
                  </span>
                  <span className={table.nameText}>
                    <Link href={href(lang, entry)} prefetch={false} className={table.link}>{shownName(lang, entry)}</Link>
                  </span>
                </div>
              </th>
              {lootColumns.map((column) => {
                const value = column === "itemLevel" ? itemLevelCell(entry.itemLevels) : entry[column];
                return (
                  <td key={column} className={column === "itemLevel" ? `${table.fact} ${table.numeric}` : table.fact} data-label={column === "itemLevel" ? copy.columns.itemLevel : undefined} data-empty={value === undefined || undefined}>
                    {value ?? <span aria-hidden="true">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ) : null;

  const bossList = bosses.length ? (
    <section className={sections.section} aria-labelledby="record-bosses">
      <h2 id="record-bosses" className={styles.columnTitle}>{copy.bosses}</h2>
      <ol className={sections.bossList}>
        {bosses.map(({ entity: boss }) => (
          <li key={boss.id} className={sections.boss} data-hover-preview={boss.id} data-hover-icon={boss.iconUrl || undefined}>
            <span className={`${materialStyles.iconFrame} ${sections.bossIcon}`} style={materialIconFrameStyle(libraryKit, 64)} aria-hidden="true">
              <ResilientImage src={boss.iconUrl} alt="" width={56} height={56} loading="lazy" fallback={<CatalogGlyph symbol={TYPE_SYMBOLS.encounter} className={styles.glyph} />} />
            </span>
            <Link className={sections.bossLink} href={href(lang, boss)} prefetch={false}>{shownName(lang, boss)}</Link>
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  const namesakeList = namesakes.length ? (
    <section className={sections.section} aria-labelledby="record-boss">
      <h2 id="record-boss" className={styles.columnTitle}>{namesakes.length > 1 ? copy.bosses : copy.bossEncounter}</h2>
      <ul className={styles.relatedList}>
        {namesakes.map((boss) => {
          const home = namesakeInstances.get(boss.id);
          return row(boss, { meta: home ? [shownName(lang, home)] : undefined });
        })}
      </ul>
    </section>
  ) : null;

  const relationList = groups.length ? (
    <section className={sections.section} aria-labelledby="record-relations">
      <h2 id="record-relations" className={styles.columnTitle}>{copy.relationsTitle}</h2>
      <div className={styles.relationGroups}>
        {groups.map(({ key, direction, relation, entries: all }, index) => {
          // A profession teaches hundreds of recipes: a short sample, and the link opens the filtered list of all of them.
          const sampled = recipesHref !== undefined && key === "outgoing:teaches";
          const entries = sampled ? all.slice(0, PROFESSION_SAMPLE) : all;
          // One type in the whole group (ten items of a boss): the type line would repeat on every card.
          const mixed = entries.some((entry) => entry.entity.type !== entries[0].entity.type);
          return (
            <AtlasDisclosure key={key} className={styles.disclosure} open={index < 2 || undefined}
              summary={<>
                <span className={styles.disclosureTitle}>{relationTitle(direction, relation, short)}</span>
                {sampled ? null : <span className={styles.disclosureMeta}>{entries.length}</span>}
              </>}>
              {sampled && recipesHref ? (
                <p className={sections.allLink}><Link href={recipesHref} prefetch={false}>{copy.allRecipes(shownName(lang, entity as RelatedRecord))}<ArrowRight aria-hidden="true" /></Link></p>
              ) : null}
              <ul className={styles.relatedList}>
                {entries.map(({ entity: related, attributes }) => {
                  const home = sourceInstances.get(related.id);
                  const meta = [...(home ? [shownName(lang, home)] : []), ...relationshipAttributes(attributes, short, copy)];
                  return row(related, { mixed, meta });
                })}
              </ul>
            </AtlasDisclosure>
          );
        })}
      </div>
    </section>
  ) : null;

  if (!bossNav && !lootTable && !bossList && !namesakeList && !relationList) return null;
  return (
    <div id={ROOT_ID} className={sections.sections}>
      {bossNav}
      {lootTable}
      {bossList}
      {namesakeList}
      {relationList}
      <LibraryHoverPreview rootId={ROOT_ID} lang={short} loadingLabel={libraryCardCopy[short].hoverLoading} />
    </div>
  );
}

/** Placeholder of the related records while they load: the heading and a few empty rows, no text. */
export function RecordSectionsSkeleton() {
  return (
    <div className={sections.skeleton} aria-hidden="true">
      <span className={sections.skeletonTitle} />
      {Array.from({ length: 4 }, (_, index) => <span key={index} className={sections.skeletonRow} />)}
    </div>
  );
}
