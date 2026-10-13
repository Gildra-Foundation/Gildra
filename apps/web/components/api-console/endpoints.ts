/**
 * Static API reference for the console.  The API page renders from this
 * list without any request; keep it in sync with
 * backend/internal/adminpanel/console.go (`consoleEndpoints`).
 */
export type ConsoleEndpoint = { method: "GET" | "POST"; path: string; description: string; group: "catalog" | "editions" | "library" | "admin" | "other" };

export const EDITION_BASES = [
  { edition: "retail", product: "wow", base: "/world-of-warcraft/retail/v1" },
  { edition: "classic", product: "wow_classic", base: "/world-of-warcraft/classic/v1" },
  { edition: "classic-era", product: "wow_classic_era", base: "/world-of-warcraft/classic-era/v1" },
  { edition: "hardcore", product: "wow_classic_hardcore", base: "/world-of-warcraft/hardcore/v1" },
] as const;

export const CONSOLE_ENDPOINTS: ConsoleEndpoint[] = [
  { method: "GET", path: "/v1/game/products", description: "Список игровых продуктов", group: "catalog" },
  { method: "GET", path: "/v1/game/entity-types", description: "Полнота каталога по типам данных", group: "catalog" },
  { method: "GET", path: "/v1/game/entity-summaries", description: "Быстрый поиск и карточки без тяжёлых payload", group: "catalog" },
  { method: "GET", path: "/v1/game/entities", description: "Совместимый полный список каталога", group: "catalog" },
  { method: "GET", path: "/v1/game/categories", description: "Иерархические категории каталога", group: "catalog" },
  { method: "GET", path: "/v1/game/entities/{id}", description: "Карточка игровой сущности", group: "catalog" },
  { method: "GET", path: "/v1/game/entities/{id}/relationships", description: "Связи, источники, владельцы и упоминания", group: "catalog" },
  { method: "GET", path: "/v1/game/coverage", description: "Покрытие полей по активной сборке", group: "catalog" },
  { method: "GET", path: "/v1/game/source-policies", description: "Правила использования источников", group: "catalog" },
  { method: "GET", path: "/v1/game/relation-types", description: "Онтология связей каталога", group: "catalog" },
  { method: "GET", path: "/v1/game/sitemap-entries", description: "Сегментированный SEO read-model", group: "catalog" },
  { method: "GET", path: "/world-of-warcraft/{retail|classic|classic-era|hardcore}/v1", description: "Каноничные базы API по изданиям WoW: те же методы /v1 с закреплённым product", group: "editions" },
  { method: "GET", path: "/v1/library/datasets", description: "Публичные датасеты библиотеки", group: "library" },
  { method: "GET", path: "/v1/media/{id}", description: "Локально кэшированные медиа каталога", group: "library" },
  { method: "GET", path: "/v1/admin/system", description: "Быстрые проверки Postgres, ClickHouse и Redis", group: "admin" },
  { method: "GET", path: "/v1/admin/catalog-health", description: "Полнота каталога и последние импорты", group: "admin" },
  { method: "GET", path: "/v1/admin/catalog-readiness", description: "Проверки готовности базы к production", group: "admin" },
  { method: "GET", path: "/v1/admin/datasets", description: "Список датасетов панели", group: "admin" },
  { method: "GET", path: "/v1/admin/datasets/{slug}", description: "Карточка датасета", group: "admin" },
  { method: "GET", path: "/v1/admin/datasets/{slug}/freshness", description: "Свежесть датасета", group: "admin" },
  { method: "GET", path: "/v1/admin/datasets/{slug}/runs", description: "История обновлений датасета", group: "admin" },
  { method: "GET", path: "/v1/admin/tierlist-wowgg", description: "Все срезы и фильтры Tierlist — wow.gg", group: "admin" },
  { method: "GET", path: "/v1/admin/tierlist-icyveins", description: "Тиры, разборы и гайды Tierlist — Icy Veins", group: "admin" },
  { method: "POST", path: "/v1/analytics/events", description: "Приём событий аналитики", group: "other" },
  { method: "POST", path: "/v1/indexnow", description: "Отправка URL в IndexNow", group: "other" },
  { method: "POST", path: "/graphql", description: "GraphQL API каталога", group: "other" },
];
