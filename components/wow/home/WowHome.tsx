import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasSection, AtlasTile } from "@/components/atlas";
import type { Lang } from "@/lib/i18n";

const copy = {
  ru: {
    eyebrow: "Midnight",
    title: "Ваш командный центр в Азероте",
    lede: "Соберите персонажа, продумайте таланты и подготовьте маршрут — всё необходимое для следующего ключа в одном месте.",
    character: "Открыть персонажа",
    talents: "Калькулятор талантов",
    sections: "Разделы",
    characters: "Персонажи", charactersText: "Ростер, экипировка и показатели",
    mythic: "Mythic+", mythicText: "Маршруты, таймер и тактика",
    raids: "Рейды", raidsText: "Боссы, способности и тактика",
    lairs: "Логова и мировые боссы", lairsText: "Где найти, что делать, что падает",
    builds: "Начните с проверенной специализации",
    open: "Открыть таланты",
    tierLists: "Тир-листы", tierListsText: "Сила специализаций в ключах и рейдах",
    database: "База данных", databaseText: "Предметы, заклинания и задания",
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
  },
} as const;

const sections = [
  { key: "characters", href: "/wow/characters", art: "/assets/wow/loading/city.webp", position: "center 45%" },
  { key: "mythic", href: "/wow/mythic-plus", art: "/assets/wow/mythic/ruby-depth-v3-light-fast.webp", position: "center 40%" },
  { key: "raids", href: "/wow/raids", art: "/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp", position: "center 35%" },
  { key: "lairs", href: "/wow/lairs", art: "/assets/wow/lairs/bosses/nymrissa.jpg", position: "center 22%" },
  { key: "tierLists", href: "/tier-lists", art: "/assets/wow/mythic/backgrounds/kings.webp", position: "center 40%" },
  { key: "database", href: "/database", art: "/assets/wow/loading/archive.webp", position: "center 45%" },
] as const;

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
