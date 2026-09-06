-- +goose Up
CREATE TABLE platform_home_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT 'default',
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    data JSONB NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(data) = 'object')
);

CREATE UNIQUE INDEX platform_home_published_snapshot_idx
    ON platform_home_snapshots (slug, locale)
    WHERE published_at IS NOT NULL;

COMMENT ON TABLE platform_home_snapshots IS
    'Published, localized read models for the modular cross-game dashboard.';

WITH seed(data) AS (VALUES ($json$
{
  "profile":{"name":"Arcanist"},
  "greeting":"Good evening, Arcanist",
  "title":"Your worlds. One command center.",
  "games":[
    {"id":"wow","name":"World of Warcraft","subtitle":"The War Within","href":"/wow","accent":"#50b9e8","iconUrl":"/platform/home/game-wow.png"},
    {"id":"genshin","name":"Genshin Impact","subtitle":"Version 4.7","href":"/genshin","accent":"#db75d5","iconUrl":"/platform/home/game-genshin.png"},
    {"id":"diablo","name":"Diablo IV","subtitle":"Season 10","href":"/diablo","accent":"#ff3928","iconUrl":"/platform/home/game-diablo.png"},
    {"id":"league","name":"League of Legends","subtitle":"Patch 14.10","href":"/league-of-legends","accent":"#e6a13d","iconUrl":"/platform/home/game-league.png"}
  ],
  "personalMeta":[
    {"id":"wow-fury","gameId":"wow","mode":"Mythic+","focus":"Fury Warrior","focusDetail":"DPS · Melee","focusIconUrl":"/assets/specs/fury-warrior.jpg","rankLabel":"Mythic+ Score","rankValue":"2,465","rankNote":"Top 3.2%","score":"96.4","scoreLabel":"Build Score","trend":[22,39,51,43,54,68,49,64,58,76],"change":"+2.1","changeNote":"vs 7d ago","changeTone":"positive","href":"/wow/specs/fury-warrior"},
    {"id":"genshin-raiden","gameId":"genshin","mode":"Abyss","focus":"Raiden Shogun","focusDetail":"Electro · Polearm","focusIconUrl":"/platform/home/raiden.png","rankLabel":"Abyss Usage","rankValue":"84.6%","rankNote":"Top 1.4%","score":"92.7","scoreLabel":"Meta Score","trend":[24,43,56,47,61,72,58,69,65,82],"change":"+3.7%","changeNote":"vs 7d ago","changeTone":"positive","href":"/genshin/characters/raiden-shogun"},
    {"id":"diablo-quill","gameId":"diablo","mode":"Endgame","focus":"Quill Volley","focusDetail":"Spiritborn","focusIconUrl":"/platform/home/spiritborn.png","rankLabel":"Pit Tier","rankValue":"118","rankNote":"Top 4.7%","score":"96.4","scoreLabel":"Build Score","trend":[21,36,43,55,48,51,59,63,69,78],"change":"+1","changeNote":"vs 7d ago","changeTone":"positive","href":"/diablo/builds/quill-volley"},
    {"id":"league-ahri","gameId":"league","mode":"Ranked Solo","focus":"Ahri","focusDetail":"Mid","focusIconUrl":"/platform/home/ahri.png","rankLabel":"Rank","rankValue":"Master","rankNote":"LP: 127","score":"88.1","scoreLabel":"Performance","trend":[31,55,48,63,47,69,65,70,61,78],"change":"+12 LP","changeNote":"vs 7d ago","changeTone":"positive","href":"/league-of-legends/champions/ahri"}
  ],
  "continueItems":[
    {"id":"raiden-abyss","gameId":"genshin","title":"Raiden Shogun","subtitle":"Lv. 90","detail":"Electro · Polearm","activity":"Spiral Abyss","activityDetail":"Floor 12 · Chamber 3","progress":72,"imageUrl":"/platform/home/raiden.png","href":"/genshin/abyss/floor-12"},
    {"id":"fury-mythic","gameId":"wow","title":"Fury Warrior","subtitle":"Lv. 70","detail":"Fury","activity":"Mythic+","activityDetail":"The Rookery +10","progress":65,"imageUrl":"/platform/home/fury.png","href":"/wow/mythic-plus/planner/the-rookery"},
    {"id":"ahri-ranked","gameId":"league","title":"Ahri","subtitle":"Lv. 13","detail":"Mid Lane","activity":"Ranked Solo","activityDetail":"Master · 127 LP","progress":58,"imageUrl":"/platform/home/ahri.png","href":"/league-of-legends/live/arcanist"},
    {"id":"spiritborn-pit","gameId":"diablo","title":"Spiritborn","subtitle":"Paragon 210","detail":"Quill Volley","activity":"The Pit","activityDetail":"Tier 118","progress":81,"imageUrl":"/platform/home/spiritborn.png","href":"/diablo/builds/quill-volley"}
  ],
  "savedBuilds":[
    {"id":"quill-speedfarm","gameId":"diablo","title":"Quill Volley Speedfarm","subtitle":"D4 · Spiritborn","updatedAt":"2h ago","imageUrl":"/platform/home/spiritborn.png","href":"/diablo/builds/quill-volley"},
    {"id":"raiden-national","gameId":"genshin","title":"Raiden National","subtitle":"GI · Spiral Abyss","updatedAt":"5h ago","imageUrl":"/platform/home/raiden.png","href":"/genshin/teams/raiden-national"},
    {"id":"fury-m-plus","gameId":"wow","title":"Fury Warrior M+","subtitle":"WoW · Mythic+","updatedAt":"1d ago","imageUrl":"/assets/specs/fury-warrior.jpg","href":"/wow/specs/fury-warrior"},
    {"id":"ahri-control","gameId":"league","title":"Ahri Control Mage","subtitle":"LoL · Mid Lane","updatedAt":"2d ago","imageUrl":"/platform/home/ahri.png","href":"/league-of-legends/builds/ahri"}
  ],
  "patchPulse":[
    {"gameId":"wow","gameName":"World of Warcraft","changes":[{"text":"Fury Warrior damage increased in Mythic+ dungeons.","kind":"buff"},{"text":"Fortified affix returning next week.","kind":"update"}]},
    {"gameId":"genshin","gameName":"Genshin Impact","changes":[{"text":"Spiral Abyss 4.7 resets in 3 days.","kind":"update"},{"text":"Clorinde and Sigewinne banners live.","kind":"update"}]},
    {"gameId":"diablo","gameName":"Diablo IV","changes":[{"text":"Bash Barbarian aspect damage reduced.","kind":"nerf"},{"text":"Pit Leaderboards Season 10 now live.","kind":"buff"}]},
    {"gameId":"league","gameName":"League of Legends","changes":[{"text":"Ahri base HP increased.","kind":"buff"},{"text":"Lissandra mid lane win rate rising.","kind":"update"}]}
  ],
  "quickActions":[
    {"id":"compare","label":"Compare Builds","icon":"compare","href":"/compare"},
    {"id":"snapshot","label":"Meta Snapshot","icon":"chart","href":"/analytics"},
    {"id":"tiers","label":"Tier List","icon":"list","href":"/tier-lists"},
    {"id":"team","label":"Team Planner","icon":"team","href":"/genshin/teams/new"},
    {"id":"notes","label":"Patch Notes","icon":"notes","href":"/patches"},
    {"id":"alerts","label":"Alerts","icon":"alerts","href":"/profile/arcanist-vexis"}
  ],
  "recommendations":[
    {"id":"fury-guide","gameId":"wow","eyebrow":"Guide","title":"Fury Warrior: Mythic+ Guide","description":"Optimized build, rotations, and gear for Mythic+ and raids.","imageUrl":"/platform/home/recommend-fury.png","href":"/wow/specs/fury-warrior"},
    {"id":"raiden-rotation","gameId":"genshin","eyebrow":"Video","title":"Raiden Shogun Abyss Rotation","description":"Master burst windows and energy management.","imageUrl":"/platform/home/recommend-raiden.png","href":"/genshin/rotation/raiden-shogun"},
    {"id":"pit-analysis","gameId":"diablo","eyebrow":"Analysis","title":"Season 10 Pit Tier Breakdown","description":"See how builds are performing on the Season 10 leaderboards.","imageUrl":"/platform/home/recommend-diablo.png","href":"/diablo/tier-list","featured":true},
    {"id":"ahri-matchup","gameId":"league","eyebrow":"Matchup","title":"Ahri vs Control Mages","description":"Matchup insights and win conditions for ranked play.","imageUrl":"/platform/home/recommend-ahri.png","href":"/league-of-legends/matchups/ahri"}
  ],
  "labels":{"nav":{"home":"Home","search":"Search","patchCenter":"Patch Center","comparisonLab":"Comparison Lab"},"searchPlaceholder":"Search Gildra...","personalMeta":"Personal Meta","personalMetaColumns":["Game","Main Focus","Rank / Tier","Score","Trend (7d)","Change"],"viewInsights":"View All Insights","continueTitle":"Continue where you left off","manage":"Manage","resume":"Resume","savedBuilds":"Saved Builds","viewAll":"View all","goToBuilds":"Go to Builds","patchPulse":"Patch Pulse","quickActions":"Quick Actions","recommended":"Recommended for you"},
  "updatedAt":"2026-09-04T00:00:00Z"
}
$json$::jsonb))
INSERT INTO platform_home_snapshots (slug, locale, data, published_at)
SELECT 'default', 'en_US', data, now() FROM seed;

INSERT INTO platform_home_snapshots (slug, locale, data, published_at)
SELECT
    'default',
    'ru_RU',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          data,
          '{greeting}',
          '"Добрый вечер, Arcanist"'::jsonb
        ),
        '{title}',
        '"Ваши миры. Единый командный центр."'::jsonb
      ),
      '{labels}',
      '{"nav":{"home":"Главная","search":"Поиск","patchCenter":"Центр патчей","comparisonLab":"Сравнение"},"searchPlaceholder":"Поиск по Gildra...","personalMeta":"Персональная мета","personalMetaColumns":["Игра","Основной фокус","Ранг / Тир","Счёт","Тренд (7д)","Изменение"],"viewInsights":"Все инсайты","continueTitle":"Продолжить с места остановки","manage":"Управление","resume":"Продолжить","savedBuilds":"Сохранённые билды","viewAll":"Смотреть все","goToBuilds":"К билдам","patchPulse":"Пульс патчей","quickActions":"Быстрые действия","recommended":"Рекомендуем вам"}'::jsonb
    ),
    now()
FROM platform_home_snapshots
WHERE slug = 'default' AND locale = 'en_US';

-- +goose Down
DROP TABLE IF EXISTS platform_home_snapshots;
