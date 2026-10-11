import type { ReactNode } from "react";
import { AtlasFrame, AtlasHero, AtlasMetaList, AtlasNotice, AtlasSection } from "@/components/atlas";
import { AtlasDisclosure } from "@/components/atlas";
import { PageShell } from "@/components/layout/PageShell";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph, TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { CatalogRecordRow } from "@/components/database/CatalogRecordRow";
import { TooltipBody, tooltipClassName } from "@/components/database/TooltipContent";
import { entityTypeLabel } from "@/components/database/databaseCopy";
import { entityDetailCopy, mediaKindLabels, qualityCheckCopy, relationAttributeLabels, relationLabels, rewardTypeLabels, type EntityDetailCopy } from "@/components/database/entityDetailCopy";
import type { CatalogEntityComparison, CatalogEntityQuality, CatalogEntityType, CatalogEntityVersion, CatalogRelationship, GameEntity } from "@/lib/api/client";
import { formatQuestText } from "@/lib/gameText";
import type { Lang } from "@/lib/i18n";
import styles from "./entityDetail.module.css";

type Props = { entity: GameEntity; entityType?: CatalogEntityType; relationships: CatalogRelationship[]; quality: CatalogEntityQuality | null; versions: CatalogEntityVersion[]; comparison: CatalogEntityComparison | null; selectedFromBuildId?: number; selectedToBuildId?: number; lang: Lang; libraryDataset?: { slug: string; name: string } };

function versionLabel(version: CatalogEntityVersion) { return version.buildVersion || `#${version.buildNumber}`; }
function displayValue(value: unknown, copy: EntityDetailCopy) {
  if (value === null || value === undefined || value === "") return copy.noData;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function hasUnresolvedTemplate(value: string) {
  return /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/.test(value);
}

function relationshipAttributes(attributes: Record<string, unknown>, lang: Lang, copy: EntityDetailCopy) {
  const index = lang === "ru" ? 1 : 0;
  return Object.entries(attributes)
    .filter(([key, value]) => value !== null && value !== "" && typeof value !== "object" && key !== "reward_index" && !(key === "is_choice" && value === false))
    .slice(0, 4)
    .map(([key, value]) => {
      const rendered = key === "reward_type" && typeof value === "string"
        ? rewardTypeLabels[value]?.[index] ?? value
        : key === "source" && value === "blizzard_api"
          ? "Battle.net"
          : typeof value === "boolean" ? (value ? copy.yes : copy.no) : value;
      return `${relationAttributeLabels[key]?.[index] ?? key.replaceAll("_", " ")}: ${rendered}${key === "chance_percent" ? "%" : ""}`;
    });
}

/** Folded block of the record page (kit AtlasDisclosure, framed): a title and a short fact on the summary line. */
function Disclosure({ title, meta, open, children }: { title: ReactNode; meta?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <AtlasDisclosure className={styles.disclosure} open={open || undefined}
      summary={<><span className={styles.disclosureTitle}>{title}</span>{meta !== undefined ? <span className={styles.disclosureMeta}>{meta}</span> : null}</>}>
      {children}
    </AtlasDisclosure>
  );
}

/**
 * Catalog record page on the atlas kit: hero (type, name, description, facts),
 * the in-game tooltip, related records (when there are any) and one
 * "record data" section whose secondary details stay collapsed. Server-only:
 * the tooltip markup renders here, no tooltip code ships to the browser.
 */
export function EntityDetailPage({ entity, entityType, relationships, quality, versions, comparison, selectedFromBuildId, selectedToBuildId, lang, libraryDataset }: Props) {
  const copy = entityDetailCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const builds = Array.from(new Map(versions.map((version) => [version.buildId, version])).values());
  const rawDescription = entity.type === "quest" ? formatQuestText(entity.description, lang) : entity.description;
  const unresolvedDescription = hasUnresolvedTemplate(rawDescription);
  // Keep unresolved source text available in the API payload, but never put
  // Blizzard placeholders such as $s1 or $@spelldesc in the public UI.
  const description = unresolvedDescription ? "" : rawDescription;
  const typeLabel = entityTypeLabel(entity.type, lang, entityType?.label);
  const displayName = entity.name || `${typeLabel} #${entity.externalId}`;
  const productQuery = entity.product === "wow" ? "" : `?product=${encodeURIComponent(entity.product)}`;
  const media = (entity.media ?? []).filter((asset, index, assets) => assets.findIndex((candidate) => candidate.url === asset.url) === index).slice(0, 12);
  const relationGroups = Array.from(Map.groupBy(relationships, (relationship) => `${relationship.direction}:${relationship.relation}`));
  const iconSymbol = entityType?.iconSymbol ?? "#ic-gem";
  const breadcrumbs = libraryDataset
    ? [{ label: copy.library, href: `${prefix}/library` }, { label: libraryDataset.name, href: `${prefix}/library/${encodeURIComponent(libraryDataset.slug)}${productQuery}` }, { label: displayName }]
    : [{ label: copy.database, href: `${prefix}/database` }, { label: entityType?.label ?? typeLabel, href: `${prefix}/database?type=${encodeURIComponent(entity.type)}` }, { label: displayName }];
  const buildFact = quality ? `${quality.buildVersion} · ${quality.buildNumber}` : entity.buildId ? String(entity.buildId) : null;
  const comparing = Boolean(selectedFromBuildId || selectedToBuildId);

  return (
    <PageShell lang={lang}>
      <AtlasFrame as="div" lang={lang} dataAttributes={{ "data-database-entity": true }}>
        <AtlasHero
          breadcrumbs={breadcrumbs}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          emblem={(
            <span className={styles.heroIcon}>
              <ResilientImage src={entity.iconUrl} alt="" fallback={<CatalogGlyph symbol={iconSymbol} className={styles.glyph} />} />
            </span>
          )}
          emblemShape="square"
          eyebrow={typeLabel}
          title={displayName}
          lede={description ? <span className={styles.lede}>{description}</span> : undefined}
          actions={unresolvedDescription ? <p className={styles.warning} role="status">{copy.unresolved}</p> : undefined}
          aside={(
            <AtlasMetaList columns={1} className={styles.facts} items={[
              { label: copy.gameId, value: entity.externalId },
              ...(buildFact ? [{ label: copy.build, value: buildFact }] : []),
              { label: copy.updated, value: new Date(entity.updatedAt).toLocaleDateString(locale) },
            ]} />
          )}
        />

        <AtlasSection id="tooltip" title={copy.tooltipTitle} description={copy.tooltipText}>
          {entity.tooltip ? (
            <div className={styles.tooltipStage}>
              <div data-atlas-scope className={tooltipClassName(entity, "page")} role="region" aria-labelledby={`tooltip-name-${entity.id}`}>
                <TooltipBody entity={entity} lang={lang} iconSymbol={iconSymbol} />
              </div>
            </div>
          ) : (
            <AtlasNotice title={copy.tooltipMissingTitle}>{copy.tooltipMissingText}</AtlasNotice>
          )}
        </AtlasSection>

        {relationships.length ? (
          <AtlasSection id="relations" title={copy.relationsTitle} aside={<span className={styles.count}>{copy.relationsCount(relationships.length)}</span>}>
            <div className={styles.relationGroups}>
              {relationGroups.map(([group, entries], index) => {
                const [direction, relation] = group.split(":");
                return (
                  <Disclosure key={group} open={index < 2}
                    title={<><span aria-hidden="true" className={styles.direction}>{direction === "incoming" ? "←" : "→"}</span>{relationLabels[relation]?.[lang] ?? relation.replaceAll("_", " ")}</>}
                    meta={entries.length}>
                    <ul className={styles.relatedList}>
                      {entries.map(({ entity: related, attributes }) => {
                        const relatedType = entityTypeLabel(related.type, lang);
                        return (
                          <CatalogRecordRow
                            key={related.id}
                            href={`${prefix}/database/${encodeURIComponent(related.type)}/${related.id}/${encodeURIComponent(related.slug || String(related.externalId))}`}
                            name={related.name || `${relatedType} #${related.externalId}`}
                            typeLabel={relatedType}
                            iconUrl={related.iconUrl}
                            iconSymbol={TYPE_SYMBOLS[related.type]}
                            quality={related.quality}
                            meta={[`ID\u00a0${related.externalId}`, ...relationshipAttributes(attributes, lang, copy)]}
                          />
                        );
                      })}
                    </ul>
                  </Disclosure>
                );
              })}
            </div>
          </AtlasSection>
        ) : null}

        <AtlasSection id="record" title={copy.recordTitle} description={copy.recordText}>
          <div className={styles.disclosures}>
            <Disclosure title={copy.names} meta="EN · RU">
              <p className={styles.note}>{copy.namesNote}</p>
              <div className={styles.localizations}>
                {(["en_US", "ru_RU"] as const).map((localeKey) => {
                  const localized = entity.localizations?.[localeKey];
                  const unresolved = Boolean(localized?.description && hasUnresolvedTemplate(localized.description));
                  const clientText = unresolved ? copy.unresolvedValue : localized?.description || copy.noValue;
                  const resolvedText = unresolved ? copy.unresolvedValue : localized?.resolvedDescription || localized?.description || copy.noValue;
                  return (
                    <article key={localeKey} lang={localeKey === "ru_RU" ? "ru" : "en"} className={styles.localization}>
                      <h4>{localeKey === "ru_RU" ? "Русский" : "English"}</h4>
                      <dl>
                        <div><dt>{copy.name}</dt><dd>{localized?.name || copy.noValue}</dd></div>
                        <div><dt>{copy.clientText}</dt><dd>{clientText}</dd></div>
                        {resolvedText !== clientText ? <div><dt>{copy.resolvedText}</dt><dd>{resolvedText}</dd></div> : null}
                      </dl>
                    </article>
                  );
                })}
              </div>
            </Disclosure>

            {media.length ? (
              <Disclosure title={copy.images} meta={media.length}>
                <div className={styles.gallery}>
                  {media.map((asset) => (
                    <figure key={`${asset.kind}-${asset.assetKey}-${asset.url}`}>
                      <a href={asset.url} target="_blank" rel="noreferrer">
                        <ResilientImage src={asset.url} alt={`${displayName} — ${asset.kind}`} width={asset.width} height={asset.height} loading="lazy" fallback={<span className={styles.mediaFallback}>{copy.imageUnavailable}</span>} />
                      </a>
                      <figcaption><strong>{mediaKindLabels[asset.kind]?.[lang === "ru" ? 1 : 0] ?? asset.kind.replaceAll("_", " ")}</strong><span>{asset.source === "blizzard_api" ? "Battle.net" : asset.source}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}</span></figcaption>
                    </figure>
                  ))}
                </div>
              </Disclosure>
            ) : null}

            <Disclosure title={copy.versions} meta={copy.versionsCount(versions.length)} open={comparing}>
              {builds.length > 1 ? (
                <form className={styles.versionPicker} method="get">
                  {entity.product !== "wow" ? <input type="hidden" name="product" value={entity.product} /> : null}
                  <label><span>{copy.fromBuild}</span><select name="fromBuildId" defaultValue={selectedFromBuildId ?? comparison?.from.buildId}>{builds.slice().reverse().map((version) => <option key={version.buildId} value={version.buildId}>{versionLabel(version)} · {version.buildNumber}</option>)}</select></label>
                  <label><span>{copy.toBuild}</span><select name="toBuildId" defaultValue={selectedToBuildId ?? comparison?.to.buildId}>{builds.map((version) => <option key={version.buildId} value={version.buildId}>{versionLabel(version)} · {version.buildNumber}</option>)}</select></label>
                  <button type="submit">{copy.compare}</button>
                </form>
              ) : <p className={styles.note}>{copy.oneBuild}</p>}
              {comparison ? (
                comparison.changes.length ? (
                  <div className={styles.tableBox}>
                    <table className={styles.table}>
                      <thead><tr><th scope="col">{copy.field}</th><th scope="col">{versionLabel(comparison.from)}</th><th scope="col">{versionLabel(comparison.to)}</th></tr></thead>
                      <tbody>{comparison.changes.map((change) => <tr key={change.field}><th scope="row">{change.label}</th><td>{displayValue(change.before, copy)}</td><td>{displayValue(change.after, copy)}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className={styles.note}>{copy.noChanges}</p>
              ) : null}
              {versions.length ? (
                <ol className={styles.versionList}>
                  {versions.map((version, index) => (
                    <li key={version.id} data-current={index === 0 || undefined}>
                      <span><strong>{versionLabel(version)}</strong><small>{copy.buildLine(version.buildNumber, version.revision)}</small></span>
                      <time dateTime={version.observedAt}>{new Date(version.observedAt).toLocaleDateString(locale)}</time>
                      {version.sourceUrl ? <a href={version.sourceUrl} target="_blank" rel="noreferrer">{copy.source} ↗</a> : <span />}
                    </li>
                  ))}
                </ol>
              ) : null}
            </Disclosure>

            {quality ? (
              <Disclosure title={copy.completeness} meta={<>{quality.score}% · <span data-status={quality.status}>{copy.status[quality.status] ?? quality.status}</span></>}>
                <div className={styles.quality}>
                  <div className={styles.score}>
                    <strong>{quality.score}<small>%</small></strong>
                    <span role="meter" aria-label={copy.meterLabel} aria-valuenow={quality.score} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${quality.score}%` }} /></span>
                  </div>
                  <ul className={styles.checks}>
                    {quality.checks.map((check) => {
                      const known = qualityCheckCopy[check.key]?.[lang];
                      return (
                        <li key={check.key} data-present={check.present || undefined}>
                          <span aria-hidden="true">{check.present ? "✓" : "–"}</span>
                          <div><strong>{known?.[0] ?? check.label}</strong><small>{check.present ? (known?.[1] ?? check.detail) : copy.notYet}</small></div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className={styles.qualitySources}>
                    <h4>{copy.sources}</h4>
                    {quality.sources.length ? (
                      <ul>
                        {quality.sources.map((source) => (
                          <li key={source.source}>
                            <span><strong>{source.displayName}</strong><small>{copy.documents(source.documents)}</small></span>
                            {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">{copy.open}<span className="sr-only"> {source.displayName}</span> ↗</a> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p className={styles.note}>{copy.noSource}</p>}
                  </div>
                </div>
              </Disclosure>
            ) : null}

            <Disclosure title={copy.payload}>
              <pre className={styles.payload}>{JSON.stringify(entity.payload ?? {}, null, 2)}</pre>
            </Disclosure>
          </div>
        </AtlasSection>
      </AtlasFrame>
    </PageShell>
  );
}
