import { ArrowLeft } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { trail } from "@/lib/routes/registry";

import { RaidLinkButton } from "./raidMaterial";
import { kithixCopy, kithixRaid } from "./kithixRaidData";
import styles from "./raidPage.module.css";
import { KithixGuideClient } from "./KithixGuideClient";
import { kithixGuideCopy } from "./kithixGuideData";
import guideStyles from "./sporefallGuide.module.css";
import artStyles from "./kithixPage.module.css";

export function KithixPage({ locale }: { locale: "en" | "ru" }) {
  const copy = kithixCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return <AtlasFrame lang={locale} still art={kithixRaid.artwork} artShade="deep" className={`${styles.page} ${artStyles.page}`} dataAttributes={{ "data-raid-page": kithixRaid.slug }}>
    <AtlasHero
      breadcrumbs={trail(locale, "raids", { label: kithixRaid.names[locale] })}
      className={guideStyles.pageHero}
      eyebrow={kithixGuideCopy[locale].context}
      title={kithixRaid.names[locale]}
      lede={kithixGuideCopy[locale].goal}
      actions={<RaidLinkButton raid={kithixRaid.slug} className={artStyles.button} href={`${prefix}/wow/raids`} icon={<ArrowLeft aria-hidden="true" />}>{copy.back}</RaidLinkButton>}
    />
    <AtlasSection id="kithix" className={guideStyles.guideSection}><KithixGuideClient locale={locale} /></AtlasSection>
  </AtlasFrame>;
}
