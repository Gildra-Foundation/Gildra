# Ruby Life Pools — проверка 2026-10-21 UTC

Проверены исходники `rubyLifePoolsData.ts`, `rubyLifePoolsIntel.ts`, `rubyLifePoolsMedia.ts`, запись `dungeonRoutes.ts:631–635`. Итоговые проверенные утверждения и ссылки находятся в `apps/web/data/wow/mythic-reviews/ruby-life-pools.json`. Статус — source-reviewed; прохождения в игре и подтверждённого импорта маршрута нет.

[Blizzard](https://worldofwarcraft.blizzard.com/en-us/news/24294369/) подтверждает сезон через доступный поисковый индекс; непосредственное открытие вернуло 403. [Icy Veins](https://www.icy-veins.com/wow/ruby-life-pools-dungeon-guide/) прочитан с обновлением 12 октября; [Method](https://www.method.gg/guides/dungeons/ruby-life-pools) — 14 октября 2026. Не использовать Wowhead Dragonflight Season 4 guide 2024 года как подтверждение текущего сезона. В источниках есть расхождения; они не скрыты.

Конкретные правки для интеграции root:

| Исходник | Сейчас | Рекомендуемое значение |
| --- | --- | --- |
| `rubyLifePoolsIntel.ts:87`, abilitySource | Tectonic Strike → Earthbound Guardian | Deepstone Earthshaper; источник Method, раздел этого NPC |
| `rubyLifePoolsData.ts:54,58` | Совет массового контроля двойного Juggernaut | «Juggernaut невосприимчив к контролю; контроль назначайте на Chillweaver»; источник Method |
| `rubyLifePoolsData.ts:126` | Thunder Stomper: Стоп, Windborne | Защита, Вся группа |
| `rubyLifePoolsIntel.ts:70` | Thunder Stomper остановить оглушением | «Периодический мгновенный урон. Заранее подготовьте лечение и защиты»; [live spell 1307476](https://www.wowhead.com/spell=1307476/thunder-stomper) |
| `rubyLifePoolsData.ts:135` | Пурж Stormcloud Barrier сразу | «Снимать щиты с учётом детонаций; не взрывать все облака одновременно» |
| `rubyLifePoolsIntel.ts:73` | Только ускорение убийства щита | Добавить опасность взрыва по цели и соседям; [live spell 392399](https://www.wowhead.com/spell=392399/stormcloud-detonation) |
| `rubyLifePoolsData.ts:143` | После смерти ровно 100% | «Проверьте фактические силы противника; проценты схемы не подтверждены MDT» |

Строка владельца Tectonic Strike должна находиться по ключу `abilitySource`, а не слепо по номеру: root может параллельно менять файл. Таблица — план конкретных замен; общие исходники этим агентом не редактировались.

Требует отдельной сверки: `Data:132–144`, `Intel:32,72,75,118,121` используют Lightning Storm / Shock Blast для Tempest Channeler / Ryvati. Свежий Method вместо этого описывает Lightning Torrent. Некоторые ссылки Method ведут в PTR, а live Wowhead Torrent заблокирован проверкой JavaScript. Поэтому нельзя честно выдавать все названия/поведение этой части за независимо подтверждённые live. До разрешения расхождения убрать категоричный «Shock Blast — кик любой ценой» либо явно показать статус непроверенного.

Маршрут: локальная модель хранит ручные x/y, counts, duration, forces и cumulative, без MDT clone IDs, версии импорта или контрольной суммы. Остановка 10 объединяет двух Destroyer, но одновременно требует разделять их на волны. Имена ArcanistVexis, ShadowNova и другие — захардкоженные назначения, а не состав пользователя. Боссы расположены в правильном порядке; точность координат не следует из верного порядка.

[MDT-ссылка Tactyks](https://wago.io/IEtQSuWgA) действительно опубликована в Method и уже совпадает с URL сайта. Wago вернул пустой web-документ; попытка shell raw endpoint завершилась DNS failure. Байты импорта не получены, состав паков/суммы/координаты/время/100% не валидировались. Следующий шаг: получить raw import в доступной среде, декодировать MDT, сверить clone IDs и floor transforms, затем отдельно показывать сбор пака, позицию танка и направление перехода.

Проверки: JSON разобран Python; обязательные поля, 7 фактов и URL источников присутствуют. Изменены только два назначенных новых файла. Commit/push/deploy не выполнялись.

## Последующая интеграция root

После индивидуального обзора получены оригинальные Wago imports. Итоговая сверка: dataset-matched. Все enemy/clone ID совпали с зафиксированным dataset; составы и последовательность отображаются на новой карте. Это не игровая проверка. Предыдущие замечания о недоступности экспорта относятся к моменту отдельного обзора. Старая ручная схема остаётся непроверенной. Полный итог — REPORT.md и import-validation.json.
