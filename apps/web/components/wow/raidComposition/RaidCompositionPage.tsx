import type { Metadata } from "next";
import { connection } from "next/server";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { runtimeFlags } from "@/lib/flags";
import { materialButtonStyle, materialPlaqueStyle } from "@/components/wow/shared/materialAtlas";
import { RaidCompositionPlanner } from "./RaidCompositionPlanner";
import { raidCompositionCopy } from "./raidCompositionCopy";
import styles from "./raidComposition.module.css";

const PATH = "/wow/raids/composition";
/** The Voidspire kit: the raid scene behind the hero is the Voidspire too. */
const KIT = "the-voidspire";

export function raidCompositionMetadata(lang: "ru" | "en"): Metadata {
  const c = raidCompositionCopy[lang];
  return {
    title: c.metaTitle, description: c.metaDescription, alternates: pairedAlternates(lang, PATH),
    openGraph: pageOpenGraph(lang, { title: c.metaTitle, description: c.metaDescription, path: `${lang === "ru" ? "/ru" : ""}${PATH}` }),
  };
}

/** /wow/raids/composition: a tool page (design.md §3.6) — raid scene hero, the roster plaque, the coverage plaque. */
export async function RaidCompositionPage({ lang }: { lang: "ru" | "en" }) {
  // Spell names link to library records only while the library is open (a runtime switch).
  await connection();
  const c = raidCompositionCopy[lang];
  return (
    <AtlasFrame lang={lang} scene="raids" className={styles.page} still foot={false} dataAttributes={{ "data-raid-composition": true }}>
      <div className={styles.hero}>
        <AtlasHero align="start" className={styles.heroHeader} title={c.title} lede={c.lede}
          breadcrumbs={trail(lang, "raidComposition")} breadcrumbsLabel={trailLabel(lang)} />
      </div>
      <RaidCompositionPlanner lang={lang} libraryOpen={runtimeFlags().catalogPublic} plaqueStyle={materialPlaqueStyle(KIT)} buttonStyle={materialButtonStyle(KIT)} />
    </AtlasFrame>
  );
}
