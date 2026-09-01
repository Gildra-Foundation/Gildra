import Link from "next/link";
import type { CatalogProduct, LibraryDataset } from "@/lib/api/client";
import { DatasetPreviewImage } from "@/components/library/DatasetPreviewImage";

type Props = {
  lang: "en" | "ru";
  datasets: LibraryDataset[];
  products: CatalogProduct[];
  selectedProduct: string;
  unavailable?: boolean;
};

const freshnessText = {
  en: { fresh: "Fresh", stale: "Stale", empty: "Empty", refreshing: "Refreshing", failed: "Refresh failed" },
  ru: { fresh: "Свежие", stale: "Устарели", empty: "Нет данных", refreshing: "Обновляются", failed: "Ошибка обновления" },
};

const productFreshnessText = {
  en: { fresh: "Fresh", stale: "Stale", failed: "Check failed", unknown: "Not checked" },
  ru: { fresh: "Свежие", stale: "Устарели", failed: "Ошибка проверки", unknown: "Нет проверки" },
};

const applicabilityText = {
  en: { pending_source: "Source needed", not_applicable: "Not applicable" },
  ru: { pending_source: "Нужен источник", not_applicable: "Не применяется" },
};

const groupText: Record<string, { en: string; ru: string }> = {
  equipment: { en: "Items & equipment", ru: "Предметы и экипировка" },
  combat: { en: "Classes & combat", ru: "Классы и бой" },
  encounters: { en: "Dungeons & raids", ru: "Подземелья и рейды" },
  crafting: { en: "Professions & crafting", ru: "Профессии и ремесло" },
  world: { en: "World & quests", ru: "Мир и задания" },
  collections: { en: "Collections", ru: "Коллекции" },
};

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

export function LibraryLanding({ lang, datasets, products, selectedProduct, unavailable = false }: Props) {
  const localePrefix = lang === "ru" ? "/ru" : "";
  const formatter = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US");
  const total = datasets.reduce((sum, dataset) => sum + dataset.entityCount, 0);
  const groups = Map.groupBy(datasets, (dataset) => dataset.group);
  const freshest = datasets.reduce<Date | null>((latest, dataset) => {
    if (!dataset.coverageUpdatedAt) return latest;
    const candidate = new Date(dataset.coverageUpdatedAt);
    return !latest || candidate > latest ? candidate : latest;
  }, null);

  return <div className="library-page">
    <header className="library-hero">
      <div>
        <p className="cap gold">{lang === "ru" ? "Проверенные данные Азерота" : "Verified Azeroth data"}</p>
        <h1>{lang === "ru" ? "Библиотека World of Warcraft" : "World of Warcraft Library"}</h1>
        <p>{lang === "ru" ? "Публичная библиотека структурированных игровых данных: изображения, tooltip, связи и происхождение каждой опубликованной записи." : "A public library of structured game data with images, tooltips, relationships and provenance for every published record."}</p>
      </div>
      <aside><strong>{unavailable ? "—" : formatter.format(total)}</strong><span>{unavailable ? (lang === "ru" ? "каталог временно закрыт" : "catalog temporarily unavailable") : (lang === "ru" ? "записей в разделах" : "records across datasets")}</span></aside>
    </header>

    {unavailable ? <section className="library-unavailable" role="alert">
      <p className="cap gold">{lang === "ru" ? "Каталог недоступен" : "Catalog unavailable"}</p>
      <h2>{lang === "ru" ? "Публикация данных временно закрыта" : "Data publication is temporarily closed"}</h2>
      <p>{lang === "ru" ? "Источники или API сейчас проходят проверку. Данные не удалены — повторите попытку позже или войдите в панель администратора." : "The sources or API are being checked. No data was deleted — try again later or sign in to the administrator console."}</p>
      <Link href={`/api-console?next=${encodeURIComponent(lang === "ru" ? "/ru/library" : "/library")}`}>{lang === "ru" ? "Открыть панель" : "Open console"}</Link>
    </section> : null}

    {!unavailable ? <nav className="library-products" aria-label={lang === "ru" ? "Версия игры" : "Game version"}>
      {products.map((product) => {
        const state = product.freshness ?? "unknown";
        const stateLabel = productFreshnessText[lang][state as keyof typeof productFreshnessText.en] ?? productFreshnessText[lang].unknown;
        return <Link key={product.slug} className={product.slug === selectedProduct ? "is-active" : ""} href={`${localePrefix}/library${product.slug === "wow" ? "" : `?product=${encodeURIComponent(product.slug)}`}`} aria-label={`${product.name}: ${stateLabel}`} title={product.freshnessReason}>
          <span className="library-product-name">{product.name}</span>
          <small className={`library-product-freshness is-${state}`}>{stateLabel}</small>
        </Link>;
      })}
    </nav> : null}

    {!unavailable ? <section className="library-datasets" aria-labelledby="library-datasets-title">
      <div className="library-section-head"><div><p className="cap">{lang === "ru" ? "Наборы данных" : "Datasets"}</p><h2 id="library-datasets-title">{lang === "ru" ? "Выберите раздел" : "Choose a dataset"}</h2></div><span>{freshest ? `${lang === "ru" ? "Проверено" : "Checked"} ${freshest.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" })}` : (lang === "ru" ? "Ожидает первой проверки" : "Awaiting first verification")}</span></div>
      <div className="library-dataset-groups">
        {Array.from(groups, ([group, entries]) => <section className="library-dataset-group" key={group} aria-labelledby={`library-group-${group}`}>
          <h3 id={`library-group-${group}`}>{groupText[group]?.[lang] ?? group}</h3>
          <div className="library-dataset-grid">{entries.map((dataset) => {
          const localizationCoverage = percentage(dataset.verifiedLocalizedCount, dataset.entityCount);
          const tooltipCoverage = percentage(dataset.tooltipCount, dataset.entityCount);
          const imageCoverage = percentage(dataset.imageCount, dataset.entityCount);
          const href = `${localePrefix}/library/${encodeURIComponent(dataset.slug)}${selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`}`;
          const tooltipID = `dataset-tooltip-${dataset.slug}`;
          const stateClass = dataset.applicability === "applicable" ? dataset.freshness : dataset.applicability;
          const stateLabel = dataset.applicability === "applicable" ? freshnessText[lang][dataset.freshness] : applicabilityText[lang][dataset.applicability];
          return <article key={dataset.slug} className="library-dataset-card">
            <Link href={href} className="library-dataset-main">
              <span className="library-dataset-art" aria-hidden="true"><DatasetPreviewImage src={dataset.previewImageUrl} iconSymbol={dataset.iconSymbol} /></span>
              <span className="library-dataset-copy"><strong>{dataset.name}</strong><small>{dataset.description}</small><b>{formatter.format(dataset.entityCount)} {lang === "ru" ? "записей" : "records"}</b></span>
              <span className="library-coverage"><span>{lang === "ru" ? "Текст" : "Text"} <b>{localizationCoverage}%</b></span><span>Tooltip <b>{tooltipCoverage}%</b></span><span>{lang === "ru" ? "Изображения" : "Images"} <b>{imageCoverage}%</b></span></span>
            </Link>
            <details className="library-dataset-status">
              <summary className={`library-freshness is-${stateClass}`} aria-describedby={tooltipID} aria-label={`${dataset.name}: ${stateLabel}`}><i />{stateLabel}</summary>
              <span id={tooltipID} role="tooltip" className="library-card-tooltip"><strong>{dataset.name}</strong><span>{dataset.applicabilityReason || dataset.freshnessReason}</span><span>{lang === "ru" ? "Подтверждённый текст" : "Verified text"}: {formatter.format(dataset.verifiedLocalizedCount)} / {formatter.format(dataset.entityCount)}</span><span>Tooltip: {formatter.format(dataset.tooltipCount)} / {formatter.format(dataset.entityCount)}</span><span>{lang === "ru" ? "Изображения" : "Images"}: {formatter.format(dataset.imageCount)} / {formatter.format(dataset.entityCount)}</span>{dataset.buildVersion ? <span>Build {dataset.buildVersion}</span> : null}</span>
            </details>
          </article>;
        })}</div>
        </section>)}
      </div>
    </section> : null}
  </div>;
}
