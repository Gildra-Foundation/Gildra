# Den of Nalorakk — проверка источников

Проверено 2026-10-21 UTC. Статус: source-reviewed; маршрут draft. Это проверка опубликованных источников, не прохождение в игре.

Прочитаны AGENTS.md и общая память `/var/lib/gildra/codex-team/memory/gildra/` (MEMORY, CONTEXT, REFERENCE и последняя запись sessions). Изменены только выделенные JSON и этот отчёт.

## Доказательства

- [Blizzard: Season 2](https://wow-site-bwa-production-eks-prod-use1-01.worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live): официальный материал доступен на production hostname Blizzard; обычный canonical URL вернул 403.
- [Method, Tactyks](https://www.method.gg/guides/dungeons/den-of-nalorakk): обновление 14 октября 2026.
- [Icy Veins, Petko](https://www.icy-veins.com/wow/den-of-nalorakk-dungeon-guide): обновление 12 октября 2026.
- [Первичный dataset MDT](https://github.com/Nnoggie/MythicDungeonTools/blob/master/Midnight/DenOfNalorakk.lua): доступно содержимое NPC/клона/группы, но master изменяемый. Не импортировали его и не калибровали координаты сайта.

Короткие оригинальные RU/EN выводы со ссылкой на источник находятся в JSON.

## Проблемы исходного dungeonRoutes.ts

Проверены строки 237–309 и 647–650 `apps/web/components/wow/mythic/dungeonRoutes.ts`.

- Последний босс: опасное неверное назначение Forceful Slam; отсутствует основная инструкция щита, добавлено неподтверждённое название Forceful Roar.
- Первый босс: категория Spoiled Supplies конфликтует с требуемым действием.
- Второй босс: неверно указан кастер Winter’s Shroud; Fractured Shivercore включены в обычный trash без подтверждения.
- Зимний участок назван Rising Winds вместо названия источника. Devouring Lunge и Storm Rush не подтверждены выбранными актуальными материалами.
- Назначения ShadowNova, MysticHeals и прочие имена в исходнике не являются реальной группой пользователя.
- Значения forces 12/10/13/13/14/16/22 составляют ровно 100, но отсутствуют NPC/clone ID и вычисление из dataset. Само суммирование не доказывает правильность маршрута.
- Длительности и x/y заданы вручную; ссылка каталога Keystone.guru не доказывает конкретные пулы.

## Следующий шаг

Импортировать конкретную версию маршрута, сопоставить каждый пул с NPC/clone ID, проверить трансформацию координат и препятствия карты, пересчитать силы и только затем менять статус. [Маршрут, на который ссылается автор Method](https://wago.io/b69_rKkRL) открылся без доступного содержимого экспорта, поэтому его состав не заявлен проверенным. Production, commit и push не выполнялись.

## Последующая интеграция root

После индивидуального обзора получены оригинальные Wago imports. Итоговая сверка: dataset-matched. Все enemy/clone ID совпали с зафиксированным dataset; составы и последовательность отображаются на новой карте. Это не игровая проверка. Предыдущие замечания о недоступности экспорта относятся к моменту отдельного обзора. Старая ручная схема остаётся непроверенной. Полный итог — REPORT.md и import-validation.json.
