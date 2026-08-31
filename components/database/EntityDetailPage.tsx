import Link from "next/link";
import { DatabaseEntityDetail } from "@/components/DatabaseDirectory";
import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import type { CatalogEntityComparison, CatalogEntityQuality, CatalogEntityType, CatalogEntityVersion, CatalogRelationship, GameEntity } from "@/lib/api/client";
import { formatQuestText } from "@/lib/gameText";
import type { Lang } from "@/lib/i18n";

type Props = { entity: GameEntity; entityType?: CatalogEntityType; relationships: CatalogRelationship[]; quality: CatalogEntityQuality | null; versions: CatalogEntityVersion[]; comparison: CatalogEntityComparison | null; selectedFromBuildId?: number; selectedToBuildId?: number; lang: Lang; libraryDataset?: { slug: string; name: string } };

const relationLabels: Record<string, { en: string; ru: string }> = {
  obtained_from: { en: "Obtained from", ru: "Добывается" }, drops: { en: "Drops", ru: "Добыча" }, rewards: { en: "Rewards", ru: "Награда" },
  sold_by: { en: "Sold by", ru: "Продаёт" }, teaches: { en: "Teaches", ru: "Обучает" }, crafted_by: { en: "Crafted by", ru: "Создаётся" },
  requires: { en: "Requires", ru: "Требует" }, reagent_for: { en: "Used in", ru: "Используется" }, owned_by: { en: "Belongs to", ru: "Принадлежит" },
  grants: { en: "Grants", ru: "Даёт" }, modifies: { en: "Modifies", ru: "Изменяет" },
  mentions: { en: "Mentions", ru: "Упоминает" },
};

function relationLabel(relation: string, lang: Lang) { return relationLabels[relation]?.[lang] ?? relation.replaceAll("_", " "); }
function versionLabel(version: CatalogEntityVersion) { return version.buildVersion || `#${version.buildNumber}`; }
function displayValue(value: unknown, lang: Lang) {
  if (value === null || value === undefined || value === "") return lang === "ru" ? "Нет данных" : "No data";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function hasUnresolvedTemplate(value: string) {
  return /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/.test(value);
}

function relationshipAttributes(attributes: Record<string, unknown>, lang: Lang) {
  const labels: Record<string, [string, string]> = {
    chance_percent: ["Drop chance", "Шанс добычи"], quantity: ["Quantity", "Количество"],
    difficulty: ["Difficulty", "Сложность"], rank: ["Rank", "Ранг"], source: ["Source", "Источник"],
    reward_type: ["Reward type", "Тип награды"], amount: ["Amount", "Количество"], is_choice: ["Choice reward", "Награда на выбор"],
  };
  const rewardTypes: Record<string, [string, string]> = {
    item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], reputation: ["Reputation", "Репутация"],
    spell: ["Spell", "Заклинание"], title: ["Title", "Звание"], experience: ["Experience", "Опыт"], money: ["Money", "Деньги"],
  };
  return Object.entries(attributes)
    .filter(([key, value]) => value !== null && value !== "" && typeof value !== "object" && key !== "reward_index" && !(key === "is_choice" && value === false))
    .slice(0, 4)
    .map(([key, value]) => {
      const rendered = key === "reward_type" && typeof value === "string"
        ? rewardTypes[value]?.[lang === "ru" ? 1 : 0] ?? value
        : key === "source" && value === "blizzard_api"
          ? "Battle.net"
          : typeof value === "boolean"
            ? value ? (lang === "ru" ? "да" : "yes") : (lang === "ru" ? "нет" : "no")
            : value;
      return `${labels[key]?.[lang === "ru" ? 1 : 0] ?? key.replaceAll("_", " ")}: ${rendered}${key === "chance_percent" ? "%" : ""}`;
    });
}

export function EntityDetailPage({ entity, entityType, relationships, quality, versions, comparison, selectedFromBuildId, selectedToBuildId, lang, libraryDataset }: Props) {
  const prefix = lang === "ru" ? "/ru" : "";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const groups = Map.groupBy(relationships, (relationship) => `${relationship.direction}:${relationship.relation}`);
  const builds = Array.from(new Map(versions.map((version) => [version.buildId, version])).values());
  const statusText = quality?.status === "verified" ? (lang === "ru" ? "Проверено" : "Verified") : quality?.status === "partial" ? (lang === "ru" ? "Частично" : "Partial") : (lang === "ru" ? "Минимум данных" : "Minimal data");
  const rawDescription = entity.type === "quest" ? formatQuestText(entity.description, lang) : entity.description;
  const unresolvedDescription = hasUnresolvedTemplate(rawDescription);
  // Keep unresolved source text available in the API payload, but never put
  // Blizzard placeholders such as $s1 or $@spelldesc in the public UI.
  const description = unresolvedDescription ? "" : rawDescription;
  const displayName = entity.name || `${entityType?.label ?? entity.type} #${entity.externalId}`;
  const productQuery = entity.product === "wow" ? "" : `?product=${encodeURIComponent(entity.product)}`;
  const media = (entity.media ?? []).filter((asset, index, assets) => assets.findIndex((candidate) => candidate.url === asset.url) === index).slice(0, 12);

  return <>
    <Icons /><TopNav />
    <div className="app"><main className="main"><article className="section route-section db-detail-page">
      <nav className="db-detail-breadcrumb" aria-label={lang === "ru" ? "Хлебные крошки" : "Breadcrumb"}>
        <Link href={libraryDataset ? `${prefix}/library` : `${prefix}/database`}>{libraryDataset ? (lang === "ru" ? "Библиотека" : "Library") : (lang === "ru" ? "База данных" : "Database")}</Link><span aria-hidden="true">/</span>
        <Link href={libraryDataset ? `${prefix}/library/${encodeURIComponent(libraryDataset.slug)}${productQuery}` : `${prefix}/database?type=${encodeURIComponent(entity.type)}`}>{libraryDataset?.name ?? entityType?.label ?? entity.type}</Link><span aria-hidden="true">/</span><span aria-current="page">#{entity.externalId}</span>
      </nav>

      <header className="db-detail-header">
        <div className="db-detail-title"><span className="db-detail-main-icon">{entity.iconUrl ? <img src={entity.iconUrl} alt="" /> : <svg className="i" aria-hidden="true"><use href={`#${entityType?.iconSymbol ?? "ic-gem"}`} /></svg>}</span><div><p className="cap gold">{entityType?.label ?? entity.type}</p><h1>{displayName}</h1>{description ? <p>{description}</p> : null}{unresolvedDescription ? <p className="db-detail-warning" role="status">{lang === "ru" ? "В описании остались переменные источника — значение ещё не разрешено." : "Source template variables remain in this description; the value is not resolved yet."}</p> : null}</div></div>
        <dl><div><dt>{lang === "ru" ? "ID в игре" : "Game ID"}</dt><dd>{entity.externalId}</dd></div>{quality ? <div><dt>{lang === "ru" ? "Сборка" : "Build"}</dt><dd>{quality.buildVersion} · {quality.buildNumber}</dd></div> : entity.buildId ? <div><dt>{lang === "ru" ? "Сборка" : "Build"}</dt><dd>{entity.buildId}</dd></div> : null}<div><dt>{lang === "ru" ? "Обновлено" : "Updated"}</dt><dd>{new Date(entity.updatedAt).toLocaleDateString(locale)}</dd></div></dl>
      </header>

      <div className="db-evidence-ribbon" aria-label={lang === "ru" ? "Паспорт данных" : "Data evidence"}><span><small>{lang === "ru" ? "Сборка" : "Build"}</small><strong>{quality?.buildVersion || quality?.buildNumber || entity.buildId || "—"}</strong></span><span><small>{lang === "ru" ? "Полнота" : "Completeness"}</small><strong>{quality ? `${quality.score}%` : "—"}</strong></span><span><small>{lang === "ru" ? "Источники" : "Sources"}</small><strong>{quality?.sources.length ?? 0}</strong></span><span><small>{lang === "ru" ? "Связи" : "Relations"}</small><strong>{relationships.length}</strong></span></div>

      <div className="db-detail-jump" aria-label={lang === "ru" ? "Разделы страницы" : "Page sections"}><a href="#localizations">{lang === "ru" ? "Локализации" : "Locales"}</a><a href="#media">{lang === "ru" ? "Изображения" : "Media"}</a><a href="#tooltip">Tooltip</a><a href="#payload">Payload</a><a href="#quality">{lang === "ru" ? "Качество" : "Quality"}</a><a href="#relations">{lang === "ru" ? "Связи" : "Graph"}</a><a href="#versions">{lang === "ru" ? "Версии" : "Versions"}</a></div>

      <section className="db-detail-section" id="localizations" aria-labelledby="entity-localizations-title">
        <div className="db-section-heading"><div><p className="cap">Source-backed locales</p><h2 id="entity-localizations-title">{lang === "ru" ? "Названия и описания" : "Names and descriptions"}</h2></div><p>{lang === "ru" ? "Без искусственного перевода" : "No synthetic translations"}</p></div>
        <div className="db-localization-grid">{["en_US", "ru_RU"].map((localeKey) => { const localized = entity.localizations?.[localeKey]; const localeName = localeKey === "ru_RU" ? "Русский" : "English"; const missing = lang === "ru" ? "Нет значения в источнике" : "No source value"; const unresolved = Boolean(localized?.description && hasUnresolvedTemplate(localized.description)); const unresolvedLabel = lang === "ru" ? "Описание ещё не разрешено для этой сборки" : "Description is not resolved for this build yet"; const rawDescription = unresolved ? unresolvedLabel : localized?.description || missing; const resolvedDescription = unresolved ? unresolvedLabel : localized?.resolvedDescription || localized?.description || missing; return <article key={localeKey} className="db-localization-card"><div><strong>{localeName}</strong><small>{localeKey}</small></div><dl><div><dt>{lang === "ru" ? "Название" : "Name"}</dt><dd>{localized?.name || missing}</dd></div><div><dt>{lang === "ru" ? "Исходное описание" : "Raw description"}</dt><dd>{rawDescription}</dd>{unresolved ? <small className="db-detail-warning">{lang === "ru" ? "Есть неразрешённые переменные" : "Unresolved source variables"}</small> : null}</div><div><dt>{lang === "ru" ? "Разрешённое описание" : "Resolved description"}</dt><dd>{resolvedDescription}</dd></div></dl></article>; })}</div>
      </section>

      <section className="db-detail-section" id="media" aria-labelledby="entity-media-title">
        <div className="db-section-heading"><div><p className="cap">Verified media</p><h2 id="entity-media-title">{lang === "ru" ? "Изображения из источника" : "Source-backed media"}</h2></div><p>{lang === "ru" ? `${media.length} подтверждённых файлов` : `${media.length} verified assets`}</p></div>
        {media.length > 0 ? <div className="db-media-gallery">{media.map((asset, index) => <figure key={`${asset.kind}-${asset.assetKey}-${asset.url}`}>
          <a href={asset.url} target="_blank" rel="noreferrer"><img src={asset.url} alt={`${displayName} — ${asset.kind}`} width={asset.width} height={asset.height} loading={index === 0 ? "eager" : "lazy"} /></a>
          <figcaption><strong>{asset.kind.replaceAll("_", " ")}</strong><span>{asset.source === "blizzard_api" ? "Battle.net" : asset.source}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}</span></figcaption>
        </figure>)}</div> : <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{lang === "ru" ? "Изображение пока не сохранено" : "No cached image yet"}</h3><p>{lang === "ru" ? "Источник или FileDataID известен, но проверенный файл ещё не доступен для выдачи." : "The source or FileDataID is known, but a verified file is not available for delivery yet."}</p></div></div>}
      </section>

      <section className="db-detail-section" id="payload" aria-labelledby="entity-payload-title">
        <div className="db-section-heading"><div><p className="cap">Raw source record</p><h2 id="entity-payload-title">{lang === "ru" ? "Полные исходные данные" : "Full source data"}</h2></div><p>{lang === "ru" ? "Версия, из которой построена запись" : "Build-pinned record payload"}</p></div>
        <details className="db-raw-payload"><summary>{lang === "ru" ? "Показать JSON payload" : "Show JSON payload"}</summary><pre>{JSON.stringify(entity.payload ?? {}, null, 2)}</pre></details>
      </section>

      <section className="db-detail-section" id="tooltip" aria-labelledby="entity-tooltip-title">
        <div className="db-section-heading"><div><p className="cap">Tooltip</p><h2 id="entity-tooltip-title">{lang === "ru" ? "Игровая информация" : "Game information"}</h2></div><p>{lang === "ru" ? "Только поля, подтверждённые источниками." : "Only source-backed fields are shown."}</p></div>
        {entity.tooltip ? <DatabaseEntityDetail entity={entity} lang={lang} iconSymbol={entityType?.iconSymbol} /> : <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{lang === "ru" ? "Tooltip пока не собран" : "Tooltip is not available yet"}</h3><p>{lang === "ru" ? "Запись существует, но проверенная проекция ещё не построена." : "The entity exists, but its verified projection has not been built yet."}</p></div></div>}
      </section>

      <section className="db-detail-section" id="quality" aria-labelledby="entity-quality-title">
        <div className="db-section-heading"><div><p className="cap">Data confidence</p><h2 id="entity-quality-title">{lang === "ru" ? "Качество и происхождение данных" : "Data quality and provenance"}</h2></div>{quality ? <span className={`db-quality-status is-${quality.status}`}>{statusText}</span> : null}</div>
        {quality ? <div className="db-quality-layout">
          <div className="db-quality-score"><strong>{quality.score}<small>%</small></strong><span>{lang === "ru" ? "полнота записи" : "record completeness"}</span><div role="meter" aria-label={lang === "ru" ? "Полнота записи" : "Record completeness"} aria-valuenow={quality.score} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${quality.score}%` }} /></div></div>
          <ul className="db-quality-checks">{quality.checks.map((check) => <li className={check.present ? "is-present" : "is-missing"} key={check.key}><span aria-hidden="true">{check.present ? "✓" : "–"}</span><div><strong>{check.label}</strong><small>{check.detail || (check.present ? (lang === "ru" ? "подтверждено" : "confirmed") : (lang === "ru" ? "пока отсутствует" : "not available yet"))}</small></div></li>)}</ul>
          <div className="db-quality-sources"><h3>{lang === "ru" ? "Источники" : "Sources"}</h3>{quality.sources.length ? <ul>{quality.sources.map((source) => <li key={source.source}><span><strong>{source.displayName}</strong><small>{lang === "ru" ? `${source.documents} документов` : `${source.documents} documents`}</small></span>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">{lang === "ru" ? "Открыть" : "Open"}<span className="sr-only"> {source.displayName}</span></a> : null}</li>)}</ul> : <p>{lang === "ru" ? "Отдельный документ происхождения пока не привязан." : "No separate provenance document is linked yet."}</p>}</div>
        </div> : <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{lang === "ru" ? "Отчёт ещё не рассчитан" : "Quality report is not available"}</h3></div></div>}
      </section>

      <section className="db-detail-section" id="relations" aria-labelledby="entity-relations-title">
        <div className="db-section-heading"><div><p className="cap">Relationship graph</p><h2 id="entity-relations-title">{lang === "ru" ? "Связи в базе данных" : "Database relationships"}</h2></div><p>{relationships.length ? (lang === "ru" ? `${relationships.length} нормализованных связей` : `${relationships.length} normalized relationships`) : (lang === "ru" ? "Связей пока нет" : "No relationships yet")}</p></div>
        {relationships.length ? <div className="db-relation-graph"><div className="db-graph-root"><span className="db-related-icon">{entity.iconUrl ? <img src={entity.iconUrl} alt="" /> : <svg className="i"><use href="#ic-gem" /></svg>}</span><strong>{displayName}</strong><small>{entity.type} · {entity.externalId}</small></div><div className="db-graph-groups">{Array.from(groups, ([group, entries]) => { const [direction, relation] = group.split(":"); return <section key={group}><h3><span aria-hidden="true">{direction === "incoming" ? "←" : "→"}</span>{relationLabel(relation, lang)}<small>{entries.length}</small></h3><div className="db-related-list">{entries.map(({ entity: related, attributes }) => { const facts = relationshipAttributes(attributes, lang); return <Link href={`${prefix}/database/${encodeURIComponent(related.type)}/${related.id}/${encodeURIComponent(related.slug || String(related.externalId))}`} key={related.id}><span className="db-related-icon">{related.iconUrl ? <img src={related.iconUrl} alt="" loading="lazy" /> : <svg className="i"><use href="#ic-gem" /></svg>}</span><span><strong>{related.name || `${related.type} #${related.externalId}`}</strong><em>{related.type} · {related.externalId}</em>{facts.length ? <small className="db-related-attrs">{facts.join(" · ")}</small> : null}</span></Link>; })}</div></section>; })}</div></div> : <div className="db-live-empty"><span aria-hidden="true">◇</span><div><h3>{lang === "ru" ? "Связей пока нет" : "No relationships yet"}</h3><p>{lang === "ru" ? "Сущность сохранена, но нормализованный граф ещё не построен." : "The entity exists, but its normalized graph has not been built yet."}</p></div></div>}
      </section>

      <section className="db-detail-section" id="versions" aria-labelledby="entity-versions-title">
        <div className="db-section-heading"><div><p className="cap">Build history</p><h2 id="entity-versions-title">{lang === "ru" ? "История и изменения" : "History and changes"}</h2></div><p>{lang === "ru" ? `${versions.length} сохранённых версий` : `${versions.length} stored versions`}</p></div>
        {builds.length > 1 ? <form className="db-version-picker" method="get">{entity.product !== "wow" ? <input type="hidden" name="product" value={entity.product} /> : null}<label><span>{lang === "ru" ? "Старая сборка" : "From build"}</span><select name="fromBuildId" defaultValue={selectedFromBuildId ?? comparison?.from.buildId}>{builds.slice().reverse().map((version) => <option key={version.buildId} value={version.buildId}>{versionLabel(version)} · {version.buildNumber}</option>)}</select></label><span aria-hidden="true">→</span><label><span>{lang === "ru" ? "Новая сборка" : "To build"}</span><select name="toBuildId" defaultValue={selectedToBuildId ?? comparison?.to.buildId}>{builds.map((version) => <option key={version.buildId} value={version.buildId}>{versionLabel(version)} · {version.buildNumber}</option>)}</select></label><button type="submit">{lang === "ru" ? "Сравнить" : "Compare"}</button></form> : null}
        {comparison ? <div className="db-version-compare"><header><span>{versionLabel(comparison.from)}</span><i aria-hidden="true">→</i><span>{versionLabel(comparison.to)}</span></header>{comparison.changes.length ? <div className="db-version-table"><table><thead><tr><th>{lang === "ru" ? "Поле" : "Field"}</th><th>{versionLabel(comparison.from)}</th><th>{versionLabel(comparison.to)}</th></tr></thead><tbody>{comparison.changes.map((change) => <tr key={change.field}><th>{change.label}</th><td>{displayValue(change.before, lang)}</td><td>{displayValue(change.after, lang)}</td></tr>)}</tbody></table></div> : <p>{lang === "ru" ? "В отображаемых полях изменений нет." : "No changes in the displayed fields."}</p>}</div> : <div className="db-version-notice"><strong>{lang === "ru" ? "Сравнение появится после второй сборки" : "Comparison needs a second build"}</strong><p>{lang === "ru" ? "История уже хранится по версиям; сейчас доступна только одна сборка." : "History is build-pinned; this entity currently has only one stored build."}</p></div>}
        {versions.length ? <ol className="db-version-list">{versions.map((version, index) => <li key={version.id}><span className={index === 0 ? "is-current" : ""} /><div><strong>{versionLabel(version)}</strong><small>Build {version.buildNumber} · rev. {version.revision}</small></div><time dateTime={version.observedAt}>{new Date(version.observedAt).toLocaleDateString(locale)}</time>{version.sourceUrl ? <a href={version.sourceUrl} target="_blank" rel="noreferrer">{lang === "ru" ? "Источник" : "Source"}</a> : null}</li>)}</ol> : null}
      </section>
    </article></main><Footer lang={lang} /></div>
  </>;
}
