# Voidscar Arena — проверка 2026-10-21

Статус: source-reviewed для сведений, draft для маршрута. Проверены исходные разделы dungeonRoutes.ts:390–463; изменения общих файлов не выполнялись.

Проверенные RU/EN сведения и конкретные исправления находятся в `apps/web/data/wow/mythic-reviews/voidscar-arena.json`; у каждого факта указан источник. Это обзор источников, не игровой прогон.

## Основание

- [Blizzard: ротация сезона](https://worldofwarcraft.blizzard.com/en-us/news/24294369/les-ombres-s%C3%A9tendent-la-saison-2-de-midnight-commence-le-19-ao%C3%BBt): индекс доступен, прямой вариант en-gb вернул 403.
- [Method/Tactyks](https://www.method.gg/guides/dungeons/voidscar-arena): прочитаны обе развилки, trash и все встречи.
- [Raider.IO](https://raider.io/uk/news/754-quick-boss-guide-voidscar-arena): сверка боссов/таймера/позиционирования.
- [Icy Veins](https://www.icy-veins.com/wow/voidscar-arena-dungeon-guide/): независимая сверка; предпочитает старт справа, Method слева. Предпочтение ветки является рекомендацией автора.
- [MDT: исходный dataset](https://github.com/Nnoggie/MythicDungeonTools/blob/master/Midnight/VoidscarArena.lua): просмотрен Lua; marker x/y в Gildra не преобразованы из его координат, selected NPC clone IDs отсутствуют.
- [Импорт, рекомендованный Method](https://wago.io/1s56kmJ_N): адрес найден непосредственно у автора; строка импорта не декодировалась.

## Границы проверки карты

Сейчас buildStops суммирует вручную заданные проценты. Их сумма не доказывает достаточный Enemy Forces. Пары координат и количество NPC в стопах не имеют связи с MDT clone IDs. Нет подтверждения безопасного перемещения, связности паков, LoS и patrol timings. Не считать точки готовым маршрутом.

Дальше: зафиксировать версию MDT, получить и декодировать выбранный маршрут; привязать NPC clones к Gildra map transform, пересчитать Enemy Forces, сверить путь и pull boundaries по реальному прохождению. Проверить карту и мобильные подписи после интеграции root.

Проверки: JSON parsing и обязательные поля; UI/сборка этим агентом не запускались. Commit/push/deploy не выполнялись.

## Последующая интеграция root

После индивидуального обзора получены оригинальные Wago imports. Итоговая сверка: dataset-matched. Все enemy/clone ID совпали с зафиксированным dataset; составы и последовательность отображаются на новой карте. Это не игровая проверка. Предыдущие замечания о недоступности экспорта относятся к моменту отдельного обзора. Старая ручная схема остаётся непроверенной. Полный итог — REPORT.md и import-validation.json.
