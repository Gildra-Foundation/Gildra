import { catalogLocaleView } from "@/lib/catalogLocale";
import type { CSSProperties, ReactNode } from "react";
import { AtlasFrame, AtlasHero, AtlasMetaList, AtlasSection } from "@/components/atlas";
import { AtlasDisclosure } from "@/components/atlas";
import { PageShell } from "@/components/layout/PageShell";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph, TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { CatalogRecordRow } from "@/components/database/CatalogRecordRow";
import { TooltipBody, tooltipClassName } from "@/components/database/TooltipContent";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { withVariantQuality } from "@/lib/library/recordQuality";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { entityDetailCopy, relationAttributeLabels, relationLabels, rewardTypeLabels, type EntityDetailCopy } from "@/components/database/entityDetailCopy";
import { getCatalogPage, type CatalogEntityType, type CatalogRelationship, type GameEntity } from "@/lib/api/client";
import { formatQuestText } from "@/lib/gameText";
import type { Lang } from "@/lib/i18n";
import styles from "./entityDetail.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";

type Props = { entity: GameEntity; entityType?: CatalogEntityType; relationships: CatalogRelationship[]; lang: Lang;
  /** The record's library dataset; without it the record is one of the types that have no dataset ("records"). */
  libraryDataset?: { slug: string; name: string };
  /** 3D model of the record (library mounts and transmog sets); the tooltip section gets a second column for it. */
  model?: ReactNode };

function hasUnresolvedTemplate(value: string) {
  return /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/.test(value);
}

function relationshipAttributes(attributes: Record<string, unknown>, lang: Lang, copy: EntityDetailCopy) {
  const index = lang === "ru" ? 1 : 0;
  return Object.entries(attributes)
    .filter(([key, value]) => value !== null && value !== "" && typeof value !== "object" && key !== "reward_index" && key !== "source" && !(key === "is_choice" && value === false))
    .slice(0, 3)
    .map(([key, value]) => {
      const rendered = key === "reward_type" && typeof value === "string"
        ? rewardTypeLabels[value]?.[index] ?? value
        : typeof value === "boolean" ? (value ? copy.yes : copy.no) : value;
      return `${relationAttributeLabels[key]?.[index] ?? key.replaceAll("_", " ")}: ${rendered}${key === "chance_percent" ? "%" : ""}`;
    });
}

/**
 * The record endpoint names the icon but carries no media URL; the summary of
 * the same record has it. One indexed ID lookup (cached like the page) fills
 * the hero and tooltip icon; on any failure the type glyph stays.
 */
async function withSummaryIcon(entity: GameEntity, lang: Lang): Promise<GameEntity> {
  if (entity.iconUrl || !entity.iconName) return entity;
  try {
    const page = await getCatalogPage({ externalIds: [entity.externalId], type: entity.type, product: entity.product, locale: lang === "ru" ? "ru_RU" : "en_US", limit: 100, timeoutMs: 4000 });
    const iconUrl = page.data.find((record) => record.id === entity.id)?.iconUrl;
    return iconUrl ? { ...entity, iconUrl } : entity;
  } catch {
    return entity;
  }
}

/** Item facts the hero shows, read from the tooltip blocks (the record endpoint has no item fields of its own). */
function itemFacts(entity: GameEntity) {
  const blocks = entity.tooltip?.blocks ?? [];
  const block = (type: string) => blocks.find((entry) => String(entry.type ?? "") === type);
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
  const variants = block("item_variants")?.entries;
  const base = Array.isArray(variants) ? (variants as Record<string, unknown>[]).find((variant) => variant.key === "base") ?? (variants[0] as Record<string, unknown> | undefined) : undefined;
  const quality = typeof entity.quality === "number" ? entity.quality : typeof base?.quality === "number" ? base.quality : undefined;
  return {
    itemLevel: number(block("item_level")?.value) ?? number(base?.item_level),
    requiredLevel: number(block("required_level")?.value),
    quality: quality !== undefined && quality in itemQualityColors ? quality as keyof typeof itemQualityColors : undefined,
  };
}

/**
 * Library record page (gildra-wow-material-design §3.8): hero with the game
 * facts a player needs (item level, required level, quality), then the
 * in-game tooltip with either the 3D model in a painted plaque or the related
 * records beside it. Build, ids, completeness and the raw record are not
 * shown. Server-only: the tooltip markup renders here, no tooltip code ships
 * to the browser.
 */
export async function EntityDetailPage({ entity, entityType, relationships, lang, libraryDataset, model }: Props) {
  // An English-only record keeps its English name on the Russian page (game names stay English) instead of "Spell #id".
  const englishName = entity.name;
  entity = await withSummaryIcon(catalogLocaleView(entity, lang), lang);
  const copy = entityDetailCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const rawDescription = entity.type === "quest" ? formatQuestText(entity.description, lang) : entity.description;
  const unresolvedDescription = hasUnresolvedTemplate(rawDescription);
  // Blizzard placeholders such as $s1 or $@spelldesc never reach the public UI.
  const description = unresolvedDescription ? "" : rawDescription;
  const typeLabel = entityTypeLabel(entity.type, lang, entityType?.label);
  const displayName = entity.name || englishName || `${typeLabel} #${entity.externalId}`;
  const productQuery = entity.product === "wow" ? "" : `?product=${encodeURIComponent(entity.product)}`;
  const relationGroups = Array.from(Map.groupBy(relationships, (relationship) => `${relationship.direction}:${relationship.relation}`));
  const iconSymbol = entityType?.iconSymbol ?? "#ic-gem";
  const breadcrumbs = [
    { label: copy.library, href: `${prefix}/library${productQuery}` },
    libraryDataset ? { label: libraryDataset.name, href: `${prefix}/library/${encodeURIComponent(libraryDataset.slug)}${productQuery}` } : { label: entityType?.label ?? typeLabel },
    { label: displayName },
  ];
  const facts = itemFacts(entity);
  const qualityColour = facts.quality !== undefined ? itemQualityColors[facts.quality] : undefined;
  const heroStyle = qualityColour ? { "--record-quality": qualityColour.frame, "--record-quality-text": qualityColour.text } as CSSProperties : undefined;
  const factItems = [
    ...(facts.itemLevel ? [{ label: copy.itemLevel, value: facts.itemLevel }] : []),
    ...(facts.requiredLevel ? [{ label: copy.requiredLevel, value: facts.requiredLevel }] : []),
    ...(qualityColour && facts.quality !== undefined ? [{ label: copy.quality, value: <span className={styles.qualityValue} style={heroStyle}>{copy.qualityNames[facts.quality]}</span> }] : []),
  ];
  // A tooltip with nothing but the name (item sets, some NPCs) adds nothing to the hero: the page goes without it.
  const tooltipBlocks = (entity.tooltip?.blocks ?? []).filter((block) => !["name", "provenance"].includes(String(block.type ?? "")));
  const tooltipEntity = entity.tooltip && tooltipBlocks.length ? withVariantQuality({ ...entity, name: displayName }) : null;

  const tooltip = tooltipEntity ? (
    <div data-atlas-scope className={tooltipClassName(tooltipEntity, "page")} role="region" aria-labelledby={`tooltip-name-${entity.id}`}>
      <TooltipBody entity={tooltipEntity} lang={lang} iconSymbol={iconSymbol} />
    </div>
  ) : null;

  const relations = relationships.length ? (
    <div className={styles.relationGroups}>
      {relationGroups.map(([group, entries], index) => {
        const [direction, relation] = group.split(":");
        return (
          <AtlasDisclosure key={group} className={styles.disclosure} open={index < 2 || undefined}
            summary={<>
              <span className={styles.disclosureTitle}><span aria-hidden="true" className={styles.direction}>{direction === "incoming" ? "←" : "→"}</span>{relationLabels[relation]?.[lang] ?? relation.replaceAll("_", " ")}</span>
              <span className={styles.disclosureMeta}>{entries.length}</span>
            </>}>
            <ul className={styles.relatedList}>
              {entries.map(({ entity: related, attributes }) => {
                const relatedType = entityTypeLabel(related.type, lang);
                return (
                  <CatalogRecordRow
                    key={related.id}
                    href={libraryRecordPath(lang, related.type, related.id, related.slug || related.externalId, related.product)}
                    name={catalogLocaleView(related, lang).name || related.name || `${relatedType} #${related.externalId}`}
                    typeLabel={relatedType}
                    iconUrl={related.iconUrl}
                    iconSymbol={TYPE_SYMBOLS[related.type]}
                    quality={related.quality}
                    meta={relationshipAttributes(attributes, lang, copy)}
                  />
                );
              })}
            </ul>
          </AtlasDisclosure>
        );
      })}
    </div>
  ) : null;

  return (
    <PageShell lang={lang}>
      <AtlasFrame as="div" lang={lang} scene="archiveDeep" dataAttributes={{ "data-database-entity": true }}>
        <AtlasHero
          breadcrumbs={breadcrumbs}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          eyebrow={typeLabel}
          title={(
            <span className={styles.heroTitle} style={heroStyle} data-quality={qualityColour ? facts.quality : undefined}>
              {/* The record's own icon in its quality frame: identity, not decoration, so it stays on phones too. */}
              <span className={styles.heroIcon} aria-hidden="true">
                <ResilientImage src={entity.iconUrl} alt="" width={96} height={96} fallback={<CatalogGlyph symbol={iconSymbol} className={styles.glyph} />} />
              </span>
              <span className={styles.heroName}>{displayName}</span>
            </span>
          )}
          // The tooltip already carries the description; the hero repeats it only when there is no tooltip.
          lede={description && !tooltip ? <span className={styles.lede}>{description}</span> : undefined}
          actions={<>
            {unresolvedDescription && !tooltip ? <p className={styles.warning} role="status">{copy.unresolved}</p> : null}
            <AtlasShareButton title={String(displayName)} locale={lang === "ru" ? "ru" : "en"} />
          </>}
          aside={factItems.length ? <AtlasMetaList columns={1} className={styles.facts} items={factItems} /> : undefined}
        />

        {tooltip && model ? (
          <AtlasSection id="tooltip" title={copy.tooltipTitle}>
            <div className={styles.pair} data-pair="model">
              <div className={styles.tooltipColumn}>{tooltip}</div>
              <MaterialPlaque kit={libraryKit} as="figure" className={styles.model} aria-label={copy.modelLabel(String(displayName))}>
                <div className={styles.modelStage}>{model}</div>
              </MaterialPlaque>
            </div>
          </AtlasSection>
        ) : tooltip ? (
          <AtlasSection id="tooltip" title={copy.tooltipTitle}>
            <div className={styles.pair} data-pair={relations ? "relations" : undefined}>
              <div className={styles.tooltipColumn}>{tooltip}</div>
              {relations ? (
                <section className={styles.relationsColumn} aria-labelledby="record-relations">
                  <h3 id="record-relations" className={styles.columnTitle}>{copy.relationsTitle}</h3>
                  {relations}
                </section>
              ) : null}
            </div>
          </AtlasSection>
        ) : model ? (
          <AtlasSection id="model" title={copy.modelTitle}>
            <MaterialPlaque kit={libraryKit} as="figure" className={`${styles.model} ${styles.modelAlone}`} aria-label={copy.modelLabel(String(displayName))}>
              <div className={styles.modelStage}>{model}</div>
            </MaterialPlaque>
          </AtlasSection>
        ) : null}

        {relations && (model || !tooltip) ? (
          <AtlasSection id="relations" title={copy.relationsTitle}>{relations}</AtlasSection>
        ) : null}
      </AtlasFrame>
    </PageShell>
  );
}
