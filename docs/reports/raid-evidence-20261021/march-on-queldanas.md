# March on Quel’Danas — проверка 21 октября 2026 UTC

Изменён только review JSON этого рейда и этот отчёт. Основной агент владеет интеграцией, исходными тактиками, иконками и общей памятью. Commit/push/deploy и production mutations не выполнялись.

## Что подтверждено

- Blizzard24264416: два босса, Бело’рен и Midnight Falls/Л’ура; уровень90; LFR227; LFR/Normal/Heroic/Mythic/Story доступны. Blizzard24294369 подтверждает начавшийся сезон2: March остаётся контентом сезона1.
- Перечитаны midnightRaidData, midnightRaidTactics, midnightRaidSpells, canonical publication, content-manifest и midnightManifest. Publication имеет лишь по одной safe ability для encounters2739/2740; остальное нельзя автоматически переносить из raw JSON в безопасную публикацию.
- Online прочитаны первичные авторские guides Icy Veins и Method для обоих боссов; отдельно Heroic и Mythic. Советы RU/EN и ссылки в JSON. Это сверка доступных источников, не игровое прохождение и не обещание отсутствия всех последних hotfix.

## Конкретные исправления для интеграции

1. Бело’рен: не ставить запрет на соприкосновение игроков разных цветов: полярность относится к механикам. Рисунок с постоянной запретной центральной полосой не должен выглядеть правилом встречи. Цвет перепроверять после Convergence; Ember→его яйцо; Eruption прерывается совпадающим цветом. Heroic Quills и Mythic splash/orb-to-boss явно отделить.
2. Guardian’s Edict: источник расходится по числам. Живой tooltip1260763:20% на5мин; local raw:20%/30сек; Method Heroic:30%/30сек; Icy:20% permanent. Безопасная публикация: правильный танк принимает соответствующий конус, ошибка усиливает босса. Не утверждать permanent/точный процент в тактике.
3. Rebirth: живой tooltip1241313 по-прежнему40сек, guides30сек. Публиковать окно урона в яйцо без точного таймера.
4. Midnight Falls: добавить пропущенную Total Eclipse/Starsplinter переходку между первой и второй фазами. Трёхрунный рисунок и два Galvanize обозначить примерами: Heroic Method описывает5рун и4луча.
5. Финал L’ura: оставаться в свете носителей, по одному кристаллу на Dark Archangel, затем выйти из Black Tide; не фиксировать clockwise как обязательную механику. Light Siphon — замачивать все появившиеся зоны: guides расходятся2/3. Prism naming меняется по source/difficulty (Safeguard vs Termination).
6. Mythic не покрывается общей схемой Normal/Heroic: дополнительно realms, dimension split и4-я фаза. В review это явно указано, общую схему не выдавать за Mythic.

## Настоящие иконки

Публичные live Wowhead tooltips получены по13 существующим spell IDs; все13iconName совпали с репозиторием. Все13 локальных JPEG присутствуют56×56. CDN JPEG bytes отличаются — это не доказывает ошибку, возможна перекодировка. Не требуется слепая замена всех файлов.

Проверены ещё4 отсутствующих ключевых иконки, настоящие имена получены от spell tooltip:

|Spell|ID|iconName|CDN bytes|
|---|---:|---|---:|
|Galvanize|1284525|ability_vehicle_electrocharge|1927|
|The Dark Archangel|1250898|ability_priest_darkarchangel|1995|
|Dawnlight Barrier|1253104|spell_holy_powerwordbarrier|1628|
|Total Eclipse|1260261|inv12_ability_druid_totaleclipse|1676|

JPEG и точные tooltip JSON: `/tmp/gildra-queldanas-audit/<spellId>.jpg` и `.json`. SHA256, URLs, bytes в review.iconAudit. Эти4файла предназначены для основной интеграции; сами ability descriptions не объявлялись publication-safe. Для UI можно связать иконку с отдельным проверенным тактическим пунктом, не менять canonical evidence.

## Live HTTP проверка

Публичная страница https://gildra.net/ru/wow/raids/march-on-queldanas ответила HTTP200,57243bytes; обе официальные страницы Blizzard с полным slug тоже HTTP200 (29571 и52825bytes). HTML сохранён только в `/tmp/gildra-queldanas-audit/`. Контент Gildra загружается клиентом, поэтому HTTP200 не выдаётся за полное визуальное подтверждение всех механик.

## Проверки и следующий шаг

- JSON parse PASS,2 уникальных boss slug,6 RU/EN tips у каждого, HTTPS источники,17live tooltip/CDN проверок.
- Основному агенту: подключить JSON на страницы, перенести нужные4JPEG, исправить перечисленные schematic подписи, выполнить общий typecheck/build и browser verification. Общий durable memory outcome записывает основной агент под flock; отдельный агент не редактировал shared files.

## Источники

- [Blizzard: Midnight raid overview and schedule](https://worldofwarcraft.blizzard.com/en-us/news/24264416/midnight-raid-overview-and-schedule)
- [Blizzard: Midnight Season 2 is now live](https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live)
- [Icy Veins: Belo’ren Normal/Heroic mechanics (19 May 2026)](https://www.icy-veins.com/wow/beloren-raid-guide)
- [Method: Belo’ren Heroic](https://www.method.gg/guides/march-on-queldanas/beloren-child-of-alar-heroic)
- [Method: Belo’ren Mythic (28 May 2026)](https://www.method.gg/guides/march-on-queldanas/beloren-child-of-alar)
- [Icy Veins: Midnight Falls Normal/Heroic mechanics (19 May 2026)](https://www.icy-veins.com/wow/midnight-falls-raid-guide)
- [Method: Midnight Falls Heroic](https://www.method.gg/guides/march-on-queldanas/midnight-falls-heroic)
- [Method: Midnight Falls Mythic (30 May 2026)](https://www.method.gg/guides/march-on-queldanas/midnight-falls)
