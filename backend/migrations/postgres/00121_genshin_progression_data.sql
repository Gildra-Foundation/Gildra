-- +goose Up
-- Source snapshot: genshin-impact.fandom.com, Character EXP and Weapon EXP,
-- verified against the 6.7 genshin-db catalog on 2026-09-01.
-- The source is community-maintained; the source note is retained here so
-- clients can distinguish these planning tables from live game payloads.
WITH character_levels AS (
    SELECT exp_required, total_exp, level::smallint
    FROM unnest(
        ARRAY[1000,1325,1700,2150,2625,3150,3725,4350,5000,5700,6450,7225,8050,8925,9825,10750,11725,12725,13775,14875,16800,18000,19250,20550,21875,23250,24650,26100,27575,29100,30650,32250,33875,35550,37250,38975,40750,42575,44425,46300,50625,52700,54775,56900,59075,61275,63525,65800,68125,70475,76500,79050,81650,84275,86950,89650,92400,95175,98000,100875,108950,112050,115175,118325,121525,124775,128075,131400,134775,138175,148700,152375,156075,159825,163600,167425,171300,175225,179175,183175,216225,243025,273100,306800,344600,386950,434425,487625,547200,0]::bigint[],
        ARRAY[0,1000,2325,4025,6175,8800,11950,15675,20025,25025,30725,37175,44400,52450,61375,71200,81950,93675,106400,120175,135050,151850,169850,189100,209650,231525,254775,279425,305525,333100,362200,392850,425100,458975,494525,531775,570750,611500,654075,698500,744800,795425,848125,902900,959800,1018875,1080150,1143675,1209475,1277600,1348075,1424575,1503625,1585275,1669550,1756500,1846150,1938550,2033725,2131725,2232600,2341550,2453600,2568775,2687100,2808625,2933400,3061475,3192875,3327650,3465825,3614525,3766900,3922975,4082800,4246400,4413825,4585125,4760350,4939525,5122700,5338925,5581950,5855050,6161850,6506450,6893400,7327825,7815450,8362650]::bigint[]
    ) WITH ORDINALITY AS values(exp_required, total_exp, level)
), weapon_levels(rarity, max_level, exp_values, total_values) AS (
    VALUES
      (1, 70, ARRAY[125,200,275,350,475,575,700,850,1000,1150,1300,1475,1650,1850,2050,2250,2450,2675,2925,3150,3575,3825,4100,4400,4700,5000,5300,5600,5925,6275,6600,6950,7325,7675,8050,8425,8825,9225,9625,10025,10975,11425,11875,12350,12825,13300,13775,14275,14800,15300,16625,17175,17725,18300,18875,19475,20075,20675,21300,21925,23675,24350,25025,25700,26400,27125,27825,28550,29275,0]::bigint[], ARRAY[0,125,325,600,950,1425,2000,2700,3550,4550,5700,7000,8475,10125,11975,14025,16275,18725,21400,24325,27475,31050,34875,38975,43375,48075,53075,58375,63975,69900,76175,82775,89725,97050,104725,112775,121200,130025,139250,148875,158900,169875,181300,193175,205525,218350,231650,245425,259700,274500,289800,306425,323600,341325,359625,378500,397975,418050,438725,460025,481950,505625,529975,555000,580700,607100,634225,662050,690600,719875]::bigint[]),
      (2, 70, ARRAY[175,275,400,550,700,875,1050,1250,1475,1700,1950,2225,2475,2775,3050,3375,3700,4025,4375,4725,5350,5750,6175,6600,7025,7475,7950,8425,8900,9400,9900,10450,10975,11525,12075,12650,13225,13825,14425,15050,16450,17125,17825,18525,19225,19950,20675,21425,22175,22950,24925,25750,26600,27450,28325,29225,30100,31025,31950,32875,35500,36500,37525,38575,39600,40675,41750,42825,43900,0]::bigint[], ARRAY[0,175,450,850,1400,2100,2975,4025,5275,6750,8450,10400,12625,15100,17875,20925,24300,28000,32025,36400,41125,46475,52225,58400,65000,72025,79500,87450,95875,104775,114175,124075,134525,145500,157025,169100,181750,194975,208800,223225,238275,254725,271850,289675,308200,327425,347375,368050,389475,411650,434600,459525,485275,511875,539325,567650,596875,626975,658000,689950,722825,758325,794825,832350,870925,910525,951200,992950,1035775,1079675]::bigint[]),
      (3, 90, ARRAY[275,425,600,800,1025,1275,1550,1850,2175,2500,2875,3250,3650,4050,4500,4950,5400,5900,6425,6925,7850,8425,9050,9675,10325,10975,11650,12350,13050,13800,14525,15300,16100,16900,17700,18550,19400,20275,21175,22050,24150,25125,26125,27150,28200,29250,30325,31425,32550,33650,36550,37775,39000,40275,41550,42850,44150,45500,46850,48225,52075,53550,55050,56550,58100,59650,61225,62800,64400,66025,71075,72825,74575,76350,78150,80000,81850,83700,85575,87500,103275,116075,130425,146500,164550,184775,207400,232775,261200,0]::bigint[], ARRAY[0,275,700,1300,2100,3125,4400,5950,7800,9975,12475,15350,18600,22250,26300,30800,35750,41150,47050,53475,60400,68250,76675,85725,95400,105725,116700,128350,140700,153750,167550,182075,197375,213475,230375,248075,266625,286025,306300,327475,349525,373675,398800,424925,452075,480275,509525,539850,571275,603825,637475,674025,711800,750800,791075,832625,875475,919625,965125,1011975,1060200,1112275,1165825,1220875,1277425,1335525,1395175,1456400,1519200,1583600,1649625,1720700,1793525,1868100,1944450,2022600,2102600,2184450,2268150,2353725,2441225,2544500,2660575,2791000,2937500,3102050,3286825,3494225,3727000,3988200]::bigint[]),
      (4, 90, ARRAY[400,625,900,1200,1550,1950,2350,2800,3300,3800,4350,4925,5525,6150,6800,7500,8200,8950,9725,10500,11900,12775,13700,14650,15625,16625,17650,18700,19775,20900,22025,23200,24375,25600,26825,28100,29400,30725,32075,33425,36575,38075,39600,41150,42725,44325,45950,47600,49300,51000,55375,57225,59100,61025,62950,64925,66900,68925,70975,73050,78900,81125,83400,85700,88025,90375,92750,95150,97575,100050,107675,110325,113000,115700,118425,121200,124000,126825,129675,132575,156475,175875,197600,221975,249300,279950,314250,352700,395775,0]::bigint[], ARRAY[0,400,1025,1925,3125,4675,6625,8975,11775,15075,18875,23225,28150,33675,39825,46625,54125,62325,71275,81000,91500,103400,116175,129875,144525,160150,176775,194425,213125,232900,253800,275825,299025,323400,349000,375825,403925,433325,464050,496125,529550,566125,604200,643800,684950,727675,772000,817950,865550,914850,965850,1021225,1078450,1137550,1198575,1261525,1326450,1393350,1462275,1533250,1606300,1685200,1766325,1849725,1935425,2023450,2113825,2206575,2301725,2399300,2499350,2607025,2717350,2830350,2946050,3064475,3185675,3309675,3436500,3566175,3698750,3855225,4031100,4228700,4450675,4699975,4979925,5294175,5646875,6042650]::bigint[]),
      (5, 90, ARRAY[600,950,1350,1800,2325,2925,3525,4200,4950,5700,6525,7400,8300,9225,10200,11250,12300,13425,14600,15750,17850,19175,20550,21975,23450,24950,26475,28050,29675,31350,33050,34800,36575,38400,40250,42150,44100,46100,48125,50150,54875,57125,59400,61725,64100,66500,68925,71400,73950,76500,83075,85850,88650,91550,94425,97400,100350,103400,106475,109575,118350,121700,125100,128550,132050,135575,139125,142725,146375,150075,161525,165500,169500,173550,177650,181800,186000,190250,194525,198875,234725,263825,296400,332975,373950,419925,471375,529050,593675,0]::bigint[], ARRAY[0,600,1550,2900,4700,7025,9950,13475,17675,22625,28325,34850,42250,50550,59775,69975,81225,93525,106950,121550,137300,155150,174325,194875,216850,240300,265250,291725,319775,349450,380800,413850,448650,485225,523625,563875,606025,650125,696225,744350,794500,849375,906500,965900,1027625,1091725,1158225,1227150,1298550,1372500,1449000,1532075,1617925,1706575,1798125,1892550,1989950,2090300,2193700,2300175,2409750,2528100,2649800,2774900,2903450,3035500,3171075,3310200,3452925,3599300,3749375,3910900,4076400,4245900,4419450,4597100,4778900,4964900,5155150,5349675,5548550,5783275,6047100,6343500,6676475,7050425,7470350,7941725,8470775,9064450]::bigint[])
), all_levels AS (
    SELECT 'character'::text AS subject, rarity::smallint, 90::smallint AS max_level,
           level, exp_required, total_exp
    FROM character_levels CROSS JOIN (VALUES (4),(5)) AS characters(rarity)
    UNION ALL
    SELECT 'weapon', w.rarity::smallint, w.max_level::smallint, u.level::smallint,
           u.exp_required, u.total_exp
    FROM weapon_levels w
    CROSS JOIN LATERAL unnest(w.exp_values, w.total_values)
      WITH ORDINALITY AS u(exp_required, total_exp, level)
)
INSERT INTO genshin_level_progression
    (game_version, subject, rarity, level, next_level, exp_required, total_exp, mora_cost)
SELECT '6.7', subject, rarity, level,
       CASE WHEN level = max_level THEN NULL ELSE level + 1 END,
       exp_required, total_exp,
       CASE WHEN level = max_level THEN 0
            WHEN subject = 'character' THEN (exp_required + 4) / 5
            ELSE (exp_required + 9) / 10 END
FROM all_levels;

WITH material_defs(material_key, material_external_id, material_name_en, material_name_ru, icon_external_id, experience_per_item) AS (
    VALUES
      ('hero_wit', 104003::bigint, 'Hero''s Wit', 'Опыт героя', 104003::bigint, 20000::bigint),
      ('adventurer_experience', 104002, 'Adventurer''s Experience', 'Опыт искателя приключений', 104002, 5000),
      ('wanderer_advice', 104001, 'Wanderer''s Advice', 'Опыт странника', 104001, 1000),
      ('mystic_enhancement_ore', 104013, 'Mystic Enhancement Ore', 'Мистическая руда усиления', 104013, 10000),
      ('fine_enhancement_ore', 104012, 'Fine Enhancement Ore', 'Тонкая руда усиления', 104012, 2000),
      ('weapon_3star', NULL, '3-Star Weapon', 'Оружие 3★', NULL, 1800),
      ('weapon_2star', NULL, '2-Star Weapon', 'Оружие 2★', NULL, 1200),
      ('weapon_1star', NULL, '1-Star Weapon', 'Оружие 1★', NULL, 600),
      ('enhancement_ore', 104011, 'Enhancement Ore', 'Руда усиления', 104011, 400)
), character_ranges(subject, rarity, from_level, to_level, material_keys, counts, wasted_experience, mora_cost) AS (
    SELECT 'character', rarity, r.from_level, r.to_level,
           ARRAY['hero_wit','adventurer_experience','wanderer_advice']::text[], r.counts,
           r.wasted_experience, r.mora_cost
    FROM (VALUES
      (1,20,ARRAY[6,0,1]::bigint[],825,24200),
      (20,40,ARRAY[28,3,4]::bigint[],675,115800),
      (40,50,ARRAY[29,0,0]::bigint[],900,116000),
      (50,60,ARRAY[42,3,0]::bigint[],875,171000),
      (60,70,ARRAY[59,3,1]::bigint[],75,239200),
      (70,80,ARRAY[80,2,2]::bigint[],125,322400),
      (80,90,ARRAY[171,0,4]::bigint[],875,684800)
    ) AS r(from_level,to_level,counts,wasted_experience,mora_cost)
    CROSS JOIN (VALUES (4),(5)) AS rarities(rarity)
), weapon_ranges(subject, rarity, from_level, to_level, material_keys, counts, wasted_experience, mora_cost) AS (
    VALUES
      ('weapon',1,1,20,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore']::text[],ARRAY[2,2,0,0,0,1]::bigint[],75,2440),
      ('weapon',1,20,40,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[12,2,0,0,1,0],50,12460),
      ('weapon',1,40,50,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[12,2,1,0,0,0],175,12580),
      ('weapon',1,50,60,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[18,2,0,1,0,1],75,18560),
      ('weapon',1,60,70,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[26,0,0,0,0,0],150,26000),
      ('weapon',2,1,20,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[3,3,0,0,0,1],0,3640),
      ('weapon',2,20,40,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[18,3,0,0,1,1],175,18700),
      ('weapon',2,40,50,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[18,3,1,0,0,2],175,18860),
      ('weapon',2,50,60,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[27,4,0,0,0,1],100,27840),
      ('weapon',2,60,70,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[38,3,1,1,0,2],75,38980),
      ('weapon',3,1,20,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[5,1,0,1,0,1],125,5360),
      ('weapon',3,20,40,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[27,2,0,0,0,0],0,27400),
      ('weapon',3,40,50,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[27,3,0,0,0,1],50,27640),
      ('weapon',3,50,60,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[40,3,1,0,0,1],50,40820),
      ('weapon',3,60,70,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[57,0,1,0,0,0],175,57180),
      ('weapon',3,70,80,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[76,4,1,0,0,1],75,77020),
      ('weapon',3,80,90,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[163,2,0,0,1,0],125,163460),
      ('weapon',4,1,20,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[8,0,0,0,1,1],0,8100),
      ('weapon',4,20,40,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[41,2,0,1,0,0],75,41520),
      ('weapon',4,40,50,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[41,3,1,0,1,1],75,41880),
      ('weapon',4,50,60,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[61,4,0,0,0,1],0,61840),
      ('weapon',4,60,70,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[86,2,1,0,0,1],150,86620),
      ('weapon',4,70,80,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[116,3,0,0,1,1],125,116700),
      ('weapon',4,80,90,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[247,3,0,0,1,0],125,247660),
      ('weapon',5,1,20,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[12,0,0,1,0,1],50,12160),
      ('weapon',5,20,40,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[62,0,1,0,1,1],0,62280),
      ('weapon',5,40,50,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[62,3,1,0,0,1],50,62820),
      ('weapon',5,50,60,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[92,3,1,0,0,0],125,92780),
      ('weapon',5,60,70,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[129,4,0,1,0,0],75,129920),
      ('weapon',5,70,80,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[175,0,0,0,0,1],25,175040),
      ('weapon',5,80,90,ARRAY['mystic_enhancement_ore','fine_enhancement_ore','weapon_3star','weapon_2star','weapon_1star','enhancement_ore'],ARRAY[371,2,0,0,0,2],25,371480)
), ranges AS (
    SELECT * FROM character_ranges
    UNION ALL
    SELECT * FROM weapon_ranges
)
INSERT INTO genshin_level_material_costs
    (game_version, subject, rarity, from_level, to_level, material_key,
     material_external_id, material_name_en, material_name_ru, icon_external_id,
     count, experience_per_item, experience_provided, wasted_experience, mora_cost)
SELECT '6.7', ranges.subject, ranges.rarity, ranges.from_level, ranges.to_level,
       materials.material_key, defs.material_external_id, defs.material_name_en,
       defs.material_name_ru, defs.icon_external_id, materials.count,
       defs.experience_per_item, materials.count * defs.experience_per_item,
       ranges.wasted_experience, ranges.mora_cost
FROM ranges
CROSS JOIN LATERAL unnest(ranges.material_keys, ranges.counts)
  AS materials(material_key, count)
JOIN material_defs defs ON defs.material_key = materials.material_key
WHERE materials.count > 0;

-- +goose Down
DELETE FROM genshin_level_material_costs WHERE game_version = '6.7';
DELETE FROM genshin_level_progression WHERE game_version = '6.7';
