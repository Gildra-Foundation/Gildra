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
      <MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/library")}>{copy.library}</MaterialLinkButton>
      <MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/talent-calc")}>{copy.calculator}</MaterialLinkButton>
    </>} />
    <AtlasSection title={copy.crafts}>
      <AtlasGrid min={280} fit>
        {copy.tools.map(tool => <MaterialPlaque key={tool.path} kit={FOREVER_KIT} as="article">
          <h3 className={materialStyles.title}><a href={p(lang, `/wow/forever/${tool.path}`)}>{tool.title}</a></h3>
          <p className={materialStyles.text}>{tool.text}</p>
        </MaterialPlaque>)}
      </AtlasGrid>
    </AtlasSection>
    <AtlasSection title={t.raids}><ForeverRaidCards lang={lang} /></AtlasSection>
    <AtlasSection title={t.newDungeons}><ForeverDungeonCards lang={lang} /></AtlasSection>
    <AtlasSection><div className={styles.journey}><Image className={styles.pine} src="/assets/wow/slim/forever/controls/ornaments/forever-pine.webp" alt="" width={96} height={174} unoptimized /><MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={p(lang, "/wow/forever/dungeons")}>{copy.everyDungeon}</MaterialLinkButton></div></AtlasSection>
  </ForeverFrame>;
}
