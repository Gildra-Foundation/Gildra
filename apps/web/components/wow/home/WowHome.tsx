import Image from "next/image";
import { ArrowRight, CalendarDays, Castle, Compass, KeyRound, Skull, Sparkles } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasSection, AtlasTile, formatAtlasDate, pluralRu } from "@/components/atlas";
import { liveSeason } from "@/lib/data/wow";
import type { Lang } from "@/lib/i18n";
import { atlasScenes } from "@/lib/atlas/scenes";
import { specIcon } from "@/lib/games/wow/assets";

const copy = {
  ru: {
    eyebrow: "Midnight",
    title: "Ваш командный центр в Азероте",
    lede: "Соберите персонажа, продумайте таланты и подготовьте маршрут — всё необходимое для следующего ключа в одном месте.",
    character: "Открыть персонажа",
    talents: "Калькулятор талантов",
    sections: "Разделы",
    characters: "Персонажи", charactersText: "Ростер, экипировка и показатели",
    mythic: "Эпохальный+", mythicText: "Маршруты, таймер и тактика",
    raids: "Рейды", raidsText: "Боссы, способности и тактика",
    lairs: "Логова и мировые боссы", lairsText: "Где найти, что делать, что падает",
    builds: "Начните с проверенной специализации",
    open: "Открыть таланты",
    tierLists: "Тир-листы", tierListsText: "Сила специализаций в ключах и рейдах",
    database: "База данных", databaseText: "Предметы, заклинания и задания",
    now: "Сейчас в игре",
    nowText: (date: string) => `По объявлению Blizzard о сезоне · проверено ${date}`,
    patch: (patch: string) => `Обновление ${patch}`,
    currentRaid: "Текущий рейд",
    bosses: (n: number) => `${n} ${pluralRu(n, "босс", "босса", "боссов")}`,
    dungeons: (n: number) => `${n} ${pluralRu(n, "подземелье", "подземелья", "подземелий")} Mythic+`,
    dungeonsText: "Маршруты, таймеры и тактика сезона",
    delves: (n: number) => `${n} ${pluralRu(n, "вылазка", "вылазки", "вылазок")}`,
    delvesText: "Вылазки текущего сезона",
    lairsNow: (lairs: number, bosses: number) => `${lairs} ${pluralRu(lairs, "логово", "логова", "логов")} и ${bosses} ${pluralRu(bosses, "мировой босс", "мировых босса", "мировых боссов")}`,
    lairsNowText: "Где найти и что делать в бою",
  },
  en: {
    eyebrow: "Midnight",
    title: "Your command center in Azeroth",
    lede: "Shape your character, plan talents and prepare a route — everything for the next key in one place.",
    character: "Open character",
    talents: "Talent calculator",
    sections: "Sections",
    characters: "Characters", charactersText: "Roster, gear and performance",
    mythic: "Mythic+", mythicText: "Routes, timer and tactics",
    raids: "Raids", raidsText: "Bosses, abilities and strategy",
    lairs: "Lairs and world bosses", lairsText: "Where to find them, what to do, what drops",
    builds: "Start with a tested specialization",
    open: "Open talents",
    tierLists: "Tier lists", tierListsText: "Specialization strength in keys and raids",
    database: "Database", databaseText: "Items, spells and quests",
    now: "Live in the game",
    nowText: (date: string) => `From Blizzard's season announcement · checked ${date}`,
    patch: (patch: string) => `Patch ${patch}`,
    currentRaid: "Current raid",
    bosses: (n: number) => `${n} ${n === 1 ? "boss" : "bosses"}`,
    dungeons: (n: number) => `${n} Mythic+ ${n === 1 ? "dungeon" : "dungeons"}`,
    dungeonsText: "Routes, timers and strategy of the season",
    delves: (n: number) => `${n} ${n === 1 ? "delve" : "delves"}`,
    delvesText: "Delves of the current season",
    lairsNow: (lairs: number, bosses: number) => `${lairs} ${lairs === 1 ? "lair" : "lairs"} and ${bosses} world ${bosses === 1 ? "boss" : "bosses"}`,
    lairsNowText: "Where to find them and what to do",
  },
} as const;

const sections = [
  { key: "characters", href: "/wow/characters", art: "/assets/wow/loading/city.webp", position: "center 45%" },
  { key: "mythic", href: "/wow/mythic-plus", art: atlasScenes.mythicPlus.art, position: "center 40%" },
  { key: "raids", href: "/wow/raids", art: atlasScenes.raids.art, position: "center 35%" },
  { key: "lairs", href: "/wow/lairs", art: atlasScenes.lairs.art, position: "center 22%" },
  { key: "tierLists", href: "/tier-lists", art: atlasScenes.tierLists.art, position: "center 40%" },
  { key: "database", href: "/database", art: atlasScenes.archive.art, position: "center 45%" },
] as const;

const builds = [
  { slug: "fury-warrior", ru: ["Неистовство", "Воин"], en: ["Fury", "Warrior"], image: specIcon("Fury Warrior") ?? "" },
  { slug: "retribution-paladin", ru: ["Воздаяние", "Паладин"], en: ["Retribution", "Paladin"], image: specIcon("Retribution Paladin") ?? "" },
  { slug: "arcane-mage", ru: ["Тайная магия", "Маг"], en: ["Arcane", "Mage"], image: specIcon("Arcane Mage") ?? "" },
] as const;

export function WowHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const t = copy[locale];
  const href = (path: string) => `${locale === "ru" ? "/ru" : ""}${path}`;
  const season = liveSeason();

  return (
    <AtlasFrame lang={locale} scene="wow" dataAttributes={{ "data-wow-atlas": true }}>
      <AtlasHero
        align="center"
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        actions={<>
          <AtlasLinkButton href={href("/wow/characters")} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{t.character}</AtlasLinkButton>
          <AtlasLinkButton href={href("/talents/fury-warrior")} icon={<Sparkles aria-hidden="true" />}>{t.talents}</AtlasLinkButton>
        </>}
      />

      {season ? (
        // Live in the game: the season's content straight from the verified manifest.
        <AtlasSection id="now" title={t.now} description={t.nowText(formatAtlasDate(season.verifiedAt, locale))}>
          <AtlasGrid min={250} fit>
            <AtlasTile href={href("/wow/midnight/season-2")} icon={<CalendarDays aria-hidden="true" />} title={season.names[locale] ?? ""} text={t.patch(season.patch)} />
            {season.raids.map((raid) => (
              <AtlasTile key={raid.slug} href={href(raid.path ?? "/wow/raids")} icon={<Skull aria-hidden="true" />} title={raid.names[locale] ?? t.currentRaid} text={raid.bosses ? `${t.currentRaid} · ${t.bosses(raid.bosses)}` : t.currentRaid} />
            ))}
            <AtlasTile href={href("/wow/mythic-plus")} icon={<KeyRound aria-hidden="true" />} title={t.dungeons(season.dungeons)} text={t.dungeonsText} />
            <AtlasTile href={href("/wow/delves")} icon={<Compass aria-hidden="true" />} title={t.delves(season.delves)} text={t.delvesText} />
            <AtlasTile href={href("/wow/lairs")} icon={<Castle aria-hidden="true" />} title={t.lairsNow(season.lairs, season.worldBosses)} text={t.lairsNowText} />
          </AtlasGrid>
        </AtlasSection>
      ) : null}

      <AtlasSection id="sections" title={t.sections}>
        {/* Six sections, each with its own scene: three columns on desktop, never an orphan. */}
        <AtlasGrid min={340} fit>
          {sections.map((section) => (
            <AtlasCard
              key={section.href}
              href={href(section.href)}
              image={{ src: section.art, alt: "", position: section.position, sizes: "(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" }}
              artRatio="16 / 7"
              title={t[section.key]}
              description={t[`${section.key}Text`]}
              cta={t[section.key]}
            />
          ))}
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="builds" title={t.builds}>
        <AtlasGrid min={260} fit>
          {builds.map((build) => {
            const [spec, className] = build[locale];
            return <AtlasTile key={build.slug} href={href(`/talents/${build.slug}`)} icon={<Image src={build.image} alt="" width={44} height={44} />} title={spec} text={`${className} · ${t.open}`} />;
          })}
        </AtlasGrid>
      </AtlasSection>
    </AtlasFrame>
  );
}
