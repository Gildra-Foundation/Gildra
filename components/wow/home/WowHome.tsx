import Image from "next/image";
import { ArrowRight, BookOpen, Crosshair, Database, Gem, MapPinned, Shield, Skull, Sparkles, Trophy, Users } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasLocaleSwitch, AtlasSection, AtlasTile } from "@/components/atlas";
import type { Lang } from "@/lib/i18n";
import styles from "./wowHome.module.css";

const copy = {
  ru: {
    breadcrumbs: "Навигация",
    eyebrow: "World of Warcraft · Midnight",
    title: "Ваш командный центр в Азероте",
    lede: "Соберите персонажа, продумайте таланты и подготовьте маршрут — всё необходимое для следующего ключа в одном месте.",
    character: "Открыть персонажа",
    talents: "Калькулятор талантов",
    toolsEyebrow: "Быстрый доступ",
    tools: "Инструменты для следующего захода",
    characters: "Персонажи", charactersText: "Ростер, экипировка и показатели",
    mythic: "Mythic+", mythicText: "Маршруты, таймер и тактика",
    raids: "Рейды", raidsText: "Боссы, способности и тактика",
    lairs: "Логова и мировые боссы", lairsText: "Где найти, что делать, что падает",
    gear: "Экипировка", gearText: "План улучшений персонажа",
    workspaceEyebrow: "Ваш персонаж",
    workspace: "Ваши персонажи Battle.net",
    workspaceText: "После входа через Battle.net здесь появятся ваши герои: экипировка, таланты и боевые инструменты на реальном персонаже.",
    workspaceSource: "Источник: Battle.net",
    openProfile: "В личный кабинет",
    buildsEyebrow: "Избранные билды",
    builds: "Начните с проверенной специализации",
    open: "Открыть таланты",
    pathEyebrow: "Путь героя",
    path: "Три шага от листа персонажа до готового подземелья",
    pathCharacter: "Персонаж", pathCharacterText: "Проверьте персонажа",
    pathBuild: "Билд", pathBuildText: "Соберите таланты",
    pathRoute: "Маршрут", pathRouteText: "Пройдите ключ вовремя",
    more: "Ещё разделы",
    tierLists: "Тир-листы", tierListsText: "Сила специализаций в ключах и рейдах",
    database: "База данных", databaseText: "Предметы, заклинания и задания",
  },
  en: {
    breadcrumbs: "Breadcrumbs",
    eyebrow: "World of Warcraft · Midnight",
    title: "Your command center in Azeroth",
    lede: "Shape your character, plan talents and prepare a route — everything for the next key in one place.",
    character: "Open character",
    talents: "Talent calculator",
    toolsEyebrow: "Quick access",
    tools: "Tools for your next run",
    characters: "Characters", charactersText: "Roster, gear and performance",
    mythic: "Mythic+", mythicText: "Routes, timer and tactics",
    raids: "Raids", raidsText: "Bosses, abilities and strategy",
    lairs: "Lairs and world bosses", lairsText: "Where to find them, what to do, what drops",
    gear: "Gear", gearText: "Character upgrade plan",
    workspaceEyebrow: "Your character",
    workspace: "Your Battle.net characters",
    workspaceText: "Sign in with Battle.net and your heroes appear here: gear, talents and combat tools on your real character.",
    workspaceSource: "Source: Battle.net",
    openProfile: "Open profile",
    buildsEyebrow: "Featured builds",
    builds: "Start with a tested specialization",
    open: "Open talents",
    pathEyebrow: "Hero path",
    path: "Three steps from your character sheet to a ready dungeon run",
    pathCharacter: "Character", pathCharacterText: "Inspect your character",
    pathBuild: "Build", pathBuildText: "Shape your talents",
    pathRoute: "Route", pathRouteText: "Time the key",
    more: "More sections",
    tierLists: "Tier lists", tierListsText: "Specialization strength in keys and raids",
    database: "Database", databaseText: "Items, spells and quests",
  },
} as const;

const builds = [
  { slug: "fury-warrior", ru: ["Неистовство", "Воин"], en: ["Fury", "Warrior"], image: "/assets/specs/fury-warrior.jpg" },
  { slug: "retribution-paladin", ru: ["Воздаяние", "Паладин"], en: ["Retribution", "Paladin"], image: "/assets/specs/ret-paladin.jpg" },
  { slug: "arcane-mage", ru: ["Тайная магия", "Маг"], en: ["Arcane", "Mage"], image: "/assets/specs/arcane-mage.jpg" },
] as const;

export function WowHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const t = copy[locale];
  const href = (path: string) => `${locale === "ru" ? "/ru" : ""}${path}`;

  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-wow-atlas": true }}>
      <AtlasHero
        toolbar={<AtlasLocaleSwitch locale={locale} path="/wow" />}
        emblem={<Shield />}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        actions={<>
          <AtlasLinkButton href={href("/wow/characters")} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{t.character}</AtlasLinkButton>
          <AtlasLinkButton href={href("/talents/fury-warrior")} icon={<Sparkles aria-hidden="true" />}>{t.talents}</AtlasLinkButton>
        </>}
        aside={(
          <div className={styles.heroArt} aria-hidden="true">
            <Image src="/assets/characters/furybar-horde-hero-v1-optimized.webp" alt="" fill priority sizes="(max-width: 1100px) 100vw, 560px" />
          </div>
        )}
      />

      <AtlasSection id="tools" eyebrow={t.toolsEyebrow} title={t.tools}>
        <AtlasGrid min={260} fit>
          <AtlasTile href={href("/wow/characters")} icon={<Users />} title={t.characters} text={t.charactersText} />
          <AtlasTile href={href("/wow/mythic-plus")} icon={<MapPinned />} title={t.mythic} text={t.mythicText} />
          <AtlasTile href={href("/wow/raids")} icon={<BookOpen />} title={t.raids} text={t.raidsText} />
          <AtlasTile href={href("/wow/lairs")} icon={<Skull />} title={t.lairs} text={t.lairsText} />
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="character" title={t.workspaceEyebrow}>
        <AtlasCard
          layout="feature"
          headingLevel={3}
          href={href("/wow/characters")}
          image={{ src: "/assets/characters/furybar-dual-axes-v4-1122.webp", alt: "", position: "center 18%" }}
          eyebrow={<><Shield aria-hidden="true" />{t.workspaceSource}</>}
          title={t.workspace}
          description={t.workspaceText}
          meta={[{ icon: <Gem aria-hidden="true" />, label: t.gearText }]}
          cta={t.openProfile}
        />
      </AtlasSection>

      <AtlasSection id="builds" eyebrow={t.buildsEyebrow} title={t.builds}>
        <AtlasGrid min={260} fit>
          {builds.map((build) => {
            const [spec, className] = build[locale];
            return <AtlasTile key={build.slug} href={href(`/talents/${build.slug}`)} icon={<Image src={build.image} alt="" width={44} height={44} />} title={spec} text={`${className} · ${t.open}`} />;
          })}
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="path" eyebrow={t.pathEyebrow} title={t.path}>
        <AtlasGrid min={260} fit as="ol">
          <li><AtlasTile href={href("/wow/characters")} index="01" icon={<Users />} title={t.pathCharacter} text={t.pathCharacterText} /></li>
          <li><AtlasTile href={href("/talents/fury-warrior")} index="02" icon={<Crosshair />} title={t.pathBuild} text={t.pathBuildText} /></li>
          <li><AtlasTile href={href("/wow/mythic-plus")} index="03" icon={<Trophy />} title={t.pathRoute} text={t.pathRouteText} /></li>
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="more" title={t.more} level={3}>
        <AtlasGrid min={260} fit>
          <AtlasTile href={href("/tier-lists")} icon={<Trophy />} title={t.tierLists} text={t.tierListsText} />
          <AtlasTile href={href("/database")} icon={<Database />} title={t.database} text={t.databaseText} />
          <AtlasTile href={href("/wow/gear")} icon={<Gem />} title={t.gear} text={t.gearText} />
        </AtlasGrid>
      </AtlasSection>
    </AtlasFrame>
  );
}
