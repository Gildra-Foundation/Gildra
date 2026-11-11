import Image from "next/image";
import styles from "./foreverInstances.module.css";
import { AtlasGrid, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import { ForeverFrame } from "./ForeverFrame";
import { foreverCopy } from "./foreverCopy";
import { instanceCopy } from "./instanceCopy";
import { ForeverDungeonCards, ForeverRaidCards } from "./ForeverInstances";

export function ForeverHome({ lang }: { lang: Lang }) {
  const copy = foreverCopy[lang];
  const t = instanceCopy[lang];
  return <ForeverFrame lang={lang}>
    <AtlasHero align="start" title={copy.title} lede={copy.lede} actions={<>
      <MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/library")}>{lang === "ru" ? "Библиотека" : "Library"}</MaterialLinkButton>
      <MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/talent-calc")}>{lang === "ru" ? "Калькулятор талантов" : "Talent calculator"}</MaterialLinkButton>
    </>} />
    <AtlasSection title={lang === "ru" ? "Классы и ремёсла" : "Classes and crafts"}>
      <AtlasGrid min={280} fit>
        {[
          { path: "classes", en: "Classes", ru: "Классы", textEn: "Abilities and roles for every class.", textRu: "Способности и роли каждого класса." },
          { path: "changes", en: "Class changes", ru: "Изменения классов", textEn: "Compare abilities and talents.", textRu: "Сравните способности и таланты." },
          { path: "professions", en: "Professions", ru: "Профессии", textEn: "Recipes, reagents and crafting.", textRu: "Рецепты, реагенты и изготовление." },
          { path: "tier-lists", en: "Tier lists", ru: "Тир-листы", textEn: "Choose a class for your adventure.", textRu: "Выберите класс для своего путешествия." },
        ].map(tool => <MaterialPlaque key={tool.path} kit={FOREVER_KIT} as="article">
          <h3 className={materialStyles.title}><a href={p(lang, `/wow/forever/${tool.path}`)}>{tool[lang]}</a></h3>
          <p className={materialStyles.text}>{lang === "ru" ? tool.textRu : tool.textEn}</p>
        </MaterialPlaque>)}
      </AtlasGrid>
    </AtlasSection>
    <AtlasSection title={t.raids}><ForeverRaidCards lang={lang} /></AtlasSection>
    <AtlasSection title={t.newDungeons}><ForeverDungeonCards lang={lang} /></AtlasSection>
    <AtlasSection><div className={styles.journey}><Image className={styles.pine} src="/assets/wow/slim/forever/controls/ornaments/forever-pine.webp" alt="" width={96} height={174} unoptimized /><MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/dungeons")}>{lang === "ru" ? "Все подземелья" : "Every dungeon"}</MaterialLinkButton></div></AtlasSection>
  </ForeverFrame>;
}
