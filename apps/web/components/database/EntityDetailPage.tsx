import { catalogLocaleView } from "@/lib/catalogLocale";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { PageShell } from "@/components/layout/PageShell";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { RecordSections, RecordSectionsSkeleton } from "@/components/database/RecordSections";
import { TooltipBody, recordFacts, tooltipClassName } from "@/components/database/TooltipContent";
import { MaterialPlaque, materialButtonStyle, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { withVariantQuality } from "@/lib/library/recordQuality";
import { entityTypeLabel } from "@/lib/platform/catalog/entityTypeLabel";
import { entityDetailCopy } from "@/components/database/entityDetailCopy";
import { getCatalogPage, type CatalogEntityType, type CatalogRelationship, type GameEntity } from "@/lib/api/client";
import { playerText } from "@/lib/gameText";
import type { Lang } from "@/lib/i18n";
import styles from "./entityDetail.module.css";
import paint from "@/components/library/libraryMaterial.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";

type Props = { entity: GameEntity; entityType?: CatalogEntityType; relationships: CatalogRelationship[]; lang: Lang;
  /** The record's library dataset; without it the record is one of the types that have no dataset ("records"). */
  libraryDataset?: { slug: string; name: string };
  /** 3D model of the record (library mounts and transmog sets); the tooltip section gets a second column for it. */
  model?: ReactNode;
  /** Canonical address of the record (the hero trail carries the BreadcrumbList). */
  canonicalPath?: string };

function hasUnresolvedTemplate(value: string) {
  return /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/.test(value);
}

/**
 * The record endpoint names the icon but carries no media URL; the summary of
 * the same record has it. One indexed ID lookup (cached like the page) fills
 * the hero and tooltip icon; on any failure the type glyph stays.
 */
async function withSummaryIcon(entity: GameEntity, lang: Lang): Promise<GameEntity> {
  // Instances name no icon on the record, but their summary carries the Adventure Guide button.
  if (entity.iconUrl || (!entity.iconName && entity.type !== "instance")) return entity;
  try {
    const page = await getCatalogPage({ externalIds: [entity.externalId], type: entity.type, product: entity.product, locale: lang === "ru" ? "ru_RU" : "en_US", limit: 100, timeoutMs: 4000 });
    const iconUrl = page.data.find((record) => record.id === entity.id)?.iconUrl;
    return iconUrl ? { ...entity, iconUrl } : entity;
  } catch {
    return entity;
  }
}

/** A picture of the record worth a frame of its own: the instance's scene, the creature's portrait. */
function recordArt(entity: GameEntity): { kind: "tile" | "zoom"; url: string } | undefined {
  const kinds: Record<string, "tile" | "zoom"> = { instance: "tile", creature: "zoom" };
  const kind = kinds[entity.type];
  const media = kind ? entity.media?.find((entry) => entry.kind === kind && entry.url && entry.cacheStatus !== "blocked" && entry.cacheStatus !== "failed") : undefined;
  return media && kind ? { kind, url: media.url } : undefined;
}

/** Quality of an item: the record's own, or that of its base variant. */
function itemQuality(entity: GameEntity) {
  const variants = (entity.tooltip?.blocks ?? []).find((entry) => String(entry.type ?? "") === "item_variants")?.entries;
  const base = Array.isArray(variants) ? (variants as Record<string, unknown>[]).find((variant) => variant.key === "base") ?? (variants[0] as Record<string, unknown> | undefined) : undefined;
  const quality = typeof entity.quality === "number" ? entity.quality : typeof base?.quality === "number" ? base.quality : undefined;
  return quality !== undefined && quality in itemQualityColors ? quality as keyof typeof itemQualityColors : undefined;
}

/**
 * Library record page (gildra-wow-material-design §3.8). Hero: the record's
 * icon in the library kit's frame (quality on its edge), one label line —
 * quality in its colour · slot · type — the name and a painted "Share".
 * The hero's side (the empty half of the artwork; under the title on tablets
 * and phones) holds the 3D model plaque (§3.9) — then the tooltip sits under
 * the title — or the in-game tooltip on the library plaque, or, without
 * either, the facts. Below: the facts plaque as one row of values (three
 * facts or more) and the related records.
 * Build, ids, completeness and the raw record are not shown. Server-only: no tooltip code ships to the browser.
 */
export async function EntityDetailPage({ entity, entityType, relationships, lang, libraryDataset, model }: Props) {
  // An English-only record keeps its English name on the Russian page (game names stay English) instead of "Spell #id".
  const englishName = entity.name;
  entity = await withSummaryIcon(catalogLocaleView(entity, lang), lang);
  const copy = entityDetailCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const rawDescription = playerText(entity.description, lang);
  const unresolvedDescription = hasUnresolvedTemplate(rawDescription);
  // Blizzard placeholders such as $s1 or $@spelldesc never reach the public UI.
  const description = unresolvedDescription ? "" : rawDescription;
  const typeLabel = entityTypeLabel(entity.type, lang, entityType?.label);
  const displayName = entity.name || englishName || `${typeLabel} #${entity.externalId}`;
  const productQuery = entity.product === "wow" ? "" : `?product=${encodeURIComponent(entity.product)}`;
  const iconSymbol = entityType?.iconSymbol ?? "#ic-gem";
  const breadcrumbs = [
    { label: copy.library, href: `${prefix}/library${productQuery}` },
    libraryDataset ? { label: libraryDataset.name, href: `${prefix}/library/${encodeURIComponent(libraryDataset.slug)}${productQuery}` } : { label: entityType?.label ?? typeLabel },
    { label: displayName },
  ];
  const quality = itemQuality(entity);
  const qualityColour = quality !== undefined ? itemQualityColors[quality] : undefined;
  const heroStyle = qualityColour ? { "--record-quality": qualityColour.frame, "--record-quality-text": qualityColour.text } as CSSProperties : undefined;
  const facts = recordFacts(entity, lang);
  const fact = (key: string) => facts.find((entry) => entry.key === key)?.value;
  // A tooltip with nothing but the name (item sets, some NPCs) adds nothing to the hero: the page goes without it.
  const tooltipBlocks = (entity.tooltip?.blocks ?? []).filter((block) => !["name", "provenance"].includes(String(block.type ?? "")));
  // Art of the record (an instance's Adventure Guide scene, a creature's portrait) stands in the hero's side
  // when there is no 3D model. A tooltip that would only repeat the description or the creature type then goes:
  // the description is the lede, the type stands in the label line.
  const art = model ? undefined : recordArt(entity);
  const plainTooltip = tooltipBlocks.every((block) => String(block.type ?? "") === "description"
    || (String(block.type ?? "") === "creature_info" && ![block.roles, block.locations, block.loot_tables].some((list) => Array.isArray(list) && list.length) && !block.creature_family));
  const tooltipEntity = entity.tooltip && tooltipBlocks.length && !(art && plainTooltip) ? withVariantQuality({ ...entity, name: displayName }) : null;
  const heroDescription = description || (art && plainTooltip ? playerText(String(tooltipBlocks.find((block) => String(block.type ?? "") === "description")?.text ?? ""), lang) : "");
  // The label line: quality in its colour, slot and armour/weapon type; without a slot the record's type closes it.
  const creature = (entity.tooltip?.blocks ?? []).find((block) => String(block.type ?? "") === "creature_info");
  // A creature's type ("Elemental") joins it when no tooltip on the page says it.
  const creatureType = !tooltipEntity && typeof creature?.creature_type === "string" && creature.creature_type.trim() ? creature.creature_type.trim() : undefined;
  const labelParts = [fact("slot"), fact("subclass"), fact("slot") ? undefined : typeLabel, creatureType].filter(Boolean) as string[];
  const label = (
    <span className={styles.label}>
      {qualityColour && quality !== undefined ? <span className={styles.qualityValue} style={heroStyle}>{copy.qualityNames[quality]}</span> : null}
      {labelParts.map((part) => <span key={part}>{part}</span>)}
    </span>
  );
  // Every fact is read from the tooltip's own blocks: with the tooltip on the page the plaque would only
  // repeat it. Without one, the plaque keeps what the label line does not (slot and type stand there), from three facts on.
  const restFacts = facts.filter((entry) => entry.key !== "slot" && entry.key !== "subclass");
  const plaqueFacts = !tooltipEntity && restFacts.length >= 3 ? restFacts : [];

  const tooltip = tooltipEntity ? (
    <MaterialPlaque kit={libraryKit} className={styles.tooltipPlaque} style={heroStyle}>
      <div data-atlas-scope className={tooltipClassName(tooltipEntity, "page")} role="region" aria-labelledby={`tooltip-name-${entity.id}`}>
        <TooltipBody entity={tooltipEntity} lang={lang} iconSymbol={iconSymbol} />
      </div>
    </MaterialPlaque>
  ) : null;

  const factsPlaque = plaqueFacts.length ? (
    <MaterialPlaque kit={libraryKit} as="section" className={styles.factsPlaque} aria-label={copy.factsLabel}>
      <dl className={styles.facts} data-count={Math.min(plaqueFacts.length, 6)}>
        {plaqueFacts.map((entry) => (
          <div key={entry.key} className={styles.fact} data-fact={entry.key}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </MaterialPlaque>
  ) : null;

  const modelPlaque = model ? (
    <MaterialPlaque kit={libraryKit} as="figure" className={styles.model} aria-label={copy.modelLabel(String(displayName))}>
      <div className={styles.modelStage}>{model}</div>
    </MaterialPlaque>
  ) : null;

  // Loot tables, boss lists and sources read more records: they stream in after the hero.
  const relations = (
    <Suspense fallback={relationships.length ? <RecordSectionsSkeleton /> : null}>
      <RecordSections entity={entity} relationships={relationships} lang={lang} />
    </Suspense>
  );

  const artPlaque = art ? (
    <MaterialPlaque kit={libraryKit} as="figure" className={styles.art} data-art={art.kind} aria-label={copy.artLabel(String(displayName))}>
      {/* A picture that fails to load keeps its stage (the record's glyph on the sunken ground), never a collapsed frame. */}
      <ResilientImage src={art.url} alt="" width={art.kind === "tile" ? 600 : 480} height={art.kind === "tile" ? 300 : 480} fetchPriority="high"
        fallback={<span className={styles.artStage}><CatalogGlyph symbol={iconSymbol} className={styles.glyph} /></span>} />
    </MaterialPlaque>
  ) : null;

  // The hero's side (the empty half of the artwork) takes the 3D model, else the tooltip, else the facts.
  // With a model the tooltip sits under the title, in the hero's own column.
  const heroSide = modelPlaque ?? artPlaque ?? tooltip ?? factsPlaque;
  const sideKind = modelPlaque ? "model" : artPlaque ? "art" : tooltip ? "tooltip" : "facts";
  const tooltipUnderTitle = modelPlaque || artPlaque ? tooltip : null;
  const bodyFacts = heroSide === factsPlaque ? null : factsPlaque;
  return (
    <PageShell lang={lang} frame>
      <AtlasFrame lang={lang} scene="archiveDeep" dataAttributes={{ "data-database-entity": true }}>
        <AtlasHero
          breadcrumbs={breadcrumbs}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          eyebrow={label}
          title={(
            <span className={styles.heroTitle} style={heroStyle} data-quality={qualityColour ? quality : undefined}>
              {/* The record's own icon in the library kit's frame, the quality on its inner edge: identity, not decoration, so it stays on phones too. */}
              <span className={`${materialStyles.iconFrame} ${styles.heroIcon}`} style={materialIconFrameStyle(libraryKit, 112)} aria-hidden="true">
                <ResilientImage src={entity.iconUrl} alt="" width={96} height={96} fallback={<CatalogGlyph symbol={iconSymbol} className={styles.glyph} />} />
              </span>
              <span className={styles.heroName} data-long={String(displayName).length > 34 || undefined}>{displayName}</span>
            </span>
          )}
          // The tooltip already carries the description; the hero repeats it only when there is no tooltip.
          lede={heroDescription && !tooltip && !hasUnresolvedTemplate(heroDescription) ? <span className={styles.lede}>{heroDescription}</span> : undefined}
          actions={<>
            {unresolvedDescription && !tooltip ? <p className={styles.warning} role="status">{copy.unresolved}</p> : null}
            <span className={paint.painted} style={materialButtonStyle(libraryKit)}><AtlasShareButton title={String(displayName)} locale={lang === "ru" ? "ru" : "en"} /></span>
            {tooltipUnderTitle ? <div className={styles.heroTooltip}>{tooltipUnderTitle}</div> : null}
          </>}
          aside={heroSide ? <div className={styles.heroSide} data-side={sideKind}>{heroSide}</div> : undefined}
        />
        <div className={styles.record}>
          {bodyFacts}
          {relations}
        </div>
      </AtlasFrame>
    </PageShell>
  );
}
