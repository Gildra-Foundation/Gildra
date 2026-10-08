# Карта проекта

Репозиторий сайта: https://github.com/Gildra-Foundation/Gildra.
Стек: Next.js / React / TypeScript, CSS Modules и общие стили; Go API, PostgreSQL, CMS и фоновые импортеры. Точные версии — в манифестах и lock-файлах.

| Область | Где искать |
| --- | --- |
| Маршруты EN | `app/` |
| Маршруты RU | `app/ru/` |
| Главная и сцена | `components/platform/home/`, `components/wow/home/` |
| Книга и оглавление | `components/platform/navigation/` |
| Рейдовый атлас | `components/wow/raid/RaidAtlasPage.tsx`, `raidAtlasPage.module.css` |
| Атлас Mythic+ | `components/wow/mythic/MythicAtlasPage.tsx`, `mythicAtlasPage.module.css` |
| Персонажи | `components/wow/characters/`, `components/wow/audit/` |
| Тир-листы | `components/blocks/wow/tierWorkspace/`, `lib/games/wow/pages/tier-lists.ts` |
| Общие стили | `app/globals.css`, `app/styles/` |
| Данные WoW | `data/wow/`, `lib/games/wow/` |
| Иллюстрации | `public/assets/wow/`, `public/platform/` |
| API и миграции | `backend/` |
| Проверки | `scripts/`, команды `package.json` |
| Архитектура и эксплуатация | `docs/`, `infra/`, `deploy/` |

Пути отражают обнаруженную локальную реализацию на 2026-10-08. Проверять наличие и импорт компонента в выбранной ветке: GitHub и локальная рабочая копия могут отличаться.
