import { AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { foreverCopy } from "./foreverCopy";
import { instanceCopy } from "./instanceCopy";
import { ForeverDungeonCards, ForeverRaidCards } from "./ForeverInstances";

export function ForeverHome({ lang }: { lang: Lang }) {
  const copy = foreverCopy[lang];
  const t = instanceCopy[lang];
  return <ForeverFrame lang={lang}>
    <AtlasHero align="start" title={copy.title} lede={copy.lede} actions={<>
      <MaterialLinkButton kit="den-of-nalorakk" fit="stack" href={p(lang, "/wow/forever/dungeons")}>{t.dungeons}</MaterialLinkButton>
      <MaterialLinkButton kit="kings-rest" fit="stack" href={p(lang, "/wow/forever/raids")}>{t.raids}</MaterialLinkButton>
    </>} />
    <AtlasSection title={t.raids}><ForeverRaidCards lang={lang} /></AtlasSection>
    <AtlasSection title={t.newDungeons}><ForeverDungeonCards lang={lang} /></AtlasSection>
  </ForeverFrame>;
}
