# Шпиль Бездны — проверка источников и иконок

Проверено: 2026-10-21T20:15:06Z. Worktree: `/home/debian/Gildra-raid-evidence-20261021`. Production writes, commits, push и deploy не выполнялись.

## Результат

Подготовлен `apps/web/data/wow/raid-reviews/the-voidspire.json`: шесть боссов, краткие RU/EN объяснения и действия, ссылки, ограничения, 41 точная привязка иконки к карточке (28 ранее отсутствовали). Для комбинированных карточек указан основной spell; иконка не выдается за все связанные эффекты.

38 исходных строк `midnightRaidSpells.json` сверены с публичным Wowhead tooltip: имя и iconName совпали в 38/38 случаях, локальные JPEG присутствуют. Это сверка game-data посредника; не доказательство установленного клиентского build.

## Что требует правки root

1. `midnightRaidTactics.ts`: обычная переходка Аверзиана названа «Бесконечный марш». March of the Endless — провал контроля клеток, запускаемый тремя соседними порталами. Предлагается «Подкрепления и уклонение».
2. Там же шаг «Добейте оставшуюся цель» после двух Umbral Collapse вводит в заблуждение: третьего неуязвимого ваятеля оставляют создать портал, затем переключаются на подкрепление.
3. Despotic Command: текущий spell1260835 указывает завершение ауры как событие появления лужи и поглощения. Старое руководство описывает dispel. Выход к краю подтвержден; обещать обычное рассеивание эффекта нельзя без проверки dispel metadata выбранной сложности.
4. В `source-localizations.json` совпадение названия не гарантирует spell того же босса: Divine Toll375576, Cosmic Barrier365626 и Blinding Light36950 не использовать как boss bindings.
5. `Shadow Phalanx1264326` — отбрасывание у ваятелей; движущаяся стена —1284786. `Silverstrike Ricochet1237729` имеет стрелу, а1259998 — вторичный эффект с другой иконкой.

## Граница актуальности

Официальный Season1 schedule подтверждает raid/zone; октябрьский feed Blizzard обсуждает Season2 и окончание Season1. Контент не следует обозначать «текущий сезон» без отдельной проверки. Гайды Icy Veins показывают обновление19мая2026, а не21октября: дата нашей проверки хранится отдельно. Нельзя механически ставить today в descriptionVerifiedAt для старого описания.

`midnightRaidData.ts` берет способности через `seasonOnePublication`, а не raw JSON. В projection у Voidspire безопасно опубликованы только Gathering Darkness1255749 и Overpowering Pulse1244419. Нулевая публикация у четырех встреч означает удержанную точность описаний, а не отсутствие настоящих иконок. Новые bindings независимы от допуска числовых spell descriptions.

## Проверенные действия по боссам

Краткие пригодные к публикации RU/EN сведения находятся в JSON. Никаких новых непроверенных чисел урона/health/loot не добавлено. Стратегические советы (например, стек танковой смены или порядок целей) не объявлены правилами движка. Mythic Crown в Icy Veins по-прежнему не заполнен, поэтому полный Mythic guide не заявляется.

## Проверка иконок

Read-only endpoint: `https://nether.wowhead.com/tooltip/spell/{id}?dataEnv=1&locale=0`. Для каждого нового binding проверены name и icon. Изображение берется по возвращенному имени с `https://wow.zamimg.com/images/wow/icons/large/{icon}.jpg`, а не выбирается по внешнему виду.

| Карточка | Spell ID | Реальная иконка |
|---|---:|---|
| umbral-collapse | 1249262 | `spell_arcane_arcanetorrent` |
| blackening-wounds | 1265540 | `spell_arcane_arcanepotency_nightborne` |
| pitch-bulwark | 1255702 | `spell_arcane_arcaneresilience` |
| void-fall | 1258883 | `inv_nullstone_void` |
| oblivions-wrath | 1281735 | `spell_priest_void-blast` |
| shadow-phalanx | 1284786 | `inv_soulbarrier` |
| gathering-darkness | 1255749 | `spell_shadow_summonvoidwalker` |
| primordial-roar | 1260046 | `spell_fire_twilightflamebreath` |
| shadowclaw-slam | 1244012 | `inv_misc_rylakclaw` |
| aftershock | 1273067 | `spell_nature_earthquake` |
| blisterburst | 1259184 | `ability_argus_soulburst` |
| void-breath | 1241864 | `inv_cosmicvoid_missile` |
| void-convergence | 1243453 | `inv_112_raiddimensius_gravity` |
| shadow-fracture | 1254088 | `inv_netherportal` |
| shattering-twilight | 1253032 | `inv_mace_2h_etherealking_d_01` |
| despotic-command | 1260835 | `inv_cosmicvoid_debuff` |
| destabilizing-strikes | 1271577 | `spell_shadow_twistedfaith` |
| entropic-unraveling | 1246175 | `inv_112_etherealwraps_empowered_blue` |
| dread-breath | 1244221 | `ability_rogue_envelopingshadows` |
| nullbeam-nullzone | 1262623 | `ability_ironmaidens_convulsiveshadows` |
| gloom | 1245391 | `inv_cosmicvoid_nova` |
| void-howl | 1245058 | `inv_cosmicvoid_orb` |
| twilight-bond-rakfang | 1245645 | `inv_misc_rubysanctum4` |
| radiant-barrier-shadowmark | 1248847 | `spell_holy_blessedresillience` |
| avengers-shield | 1246485 | `spell_holy_avengersshield` |
| sacred-shield-blinding-light | 1248674 | `ability_paladin_blessedmending` |
| divine-shield | 1246384 | `spell_holy_divineshield` |
| boss-auras | 1246162 | `spell_holy_devotionaura` |
| divine-toll | 1248644 | `inv_ability_paladin_divinetoll` |
| execution-sentence | 1248983 | `spell_paladin_executionsentence` |
| tyrs-wrath | 1248721 | `inv_ability_holyfire_debuff` |
| judgment-combo | 1246736 | `ability_paladin_judgementred` |
| grasp-of-emptiness | 1232467 | `inv_shadowelementalmount` |
| void-expulsion | 1233819 | `inv_nullstone_void` |
| void-droplets | 1241520 | `inv_elemental_primal_shadow` |
| null-corona | 1233865 | `inv_cosmicvoid_groundsate` |
| silverstrike-arrow | 1233602 | `inv_ammo_arrow_03` |
| silverstrike-barrage | 1243982 | `ability_shootwand` |
| ricochet-barrier | 1237729 | `inv_ammo_arrow_02` |
| voidstalker-sting | 1237040 | `ability_ironmaidens_convulsiveshadows` |
| aspect-of-the-end | 1239080 | `spell_warlock_demonsoul` |

JPEG staging: `/tmp/voidspire-icons/{spellId}.jpg`; manifest с SHA256 `/tmp/voidspire-icon-manifest.json`. Root должен скопировать в утвержденный public path и применить mapping; агент меняет только свои два output-файла.

## Ограничения проверки

Live URL через web tool не открылся; read-only urllib к `https://gildra.net/ru/wow/raids/the-voidspire` вернул HTTP403. UI/API/render полнота в production этой проверкой не подтверждается. Локальный исходник и фактически опубликованный projection прочитаны.

## Источники

- [Blizzard: Midnight Season 1 schedule](https://worldofwarcraft.blizzard.com/en-us/news/24266321/midnight-season-1-mythic-now-available)
- [Blizzard: October 2026 hotfix feed](https://news.blizzard.com/en-gb/article/24307310/hotfixes-october-20-2026)
- [Icy Veins: imperator-averzian](https://www.icy-veins.com/wow/imperator-averzian-raid-guide)
- [Icy Veins: vorasius](https://www.icy-veins.com/wow/vorasius-raid-guide)
- [Icy Veins: fallen-king-salhadaar](https://www.icy-veins.com/wow/fallen-king-salhadaar-raid-guide)
- [Icy Veins: vaelgor-ezzorak](https://www.icy-veins.com/wow/vaelgor-and-ezzorak-raid-guide)
- [Icy Veins: lightblinded-vanguard](https://www.icy-veins.com/wow/lightblinded-vanguard-raid-guide)
- [Icy Veins: crown-of-the-cosmos](https://www.icy-veins.com/wow/crown-of-the-cosmos-raid-guide)

Следующее действие: root интегрирует JSON, JPEG и три исправления; проверяет RU/EN карточки, build/typecheck и загрузку локальных изображений. Финальную запись общей памяти делает root под flock, включая эти проверенные ограничения.
