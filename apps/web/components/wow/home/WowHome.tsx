import { ArrowRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialCard, MaterialLinkButton, MaterialPlaque, materialStyles, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { liveSeason } from "@/lib/data/season";
import type { Lang } from "@/lib/i18n";
import { atlasScenes } from "@/lib/atlas/scenes";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";

/** One kit for the section cards, one for the hero and the talents plaque (design.md §0: ≤ 3 kits, each with a reason). */
const CARD_KIT: MaterialKit = "kings-rest";
const HERO_KIT: MaterialKit = "den-of-nalorakk";

// Every destination appears once: characters in the hero, talents in the closing plaque, the rest as cards.
const sections = [
  { key: "mythic", href: "/wow/mythic-plus", art: atlasScenes.mythicPlus.art, position: "center 40%" },
  { key: "raids", href: "/wow/raids", art: atlasScenes.raids.art, position: "center 35%" },
  { key: "lairs", href: "/wow/lairs", art: atlasScenes.lairs.art, position: "72% 45%" },
  { key: "tierLists", href: "/tier-lists", art: atlasScenes.tierLists.art, position: "72% 50%" },
  { key: "library", href: "/library", art: atlasScenes.library.art, position: "74% 45%" },
  { key: "transmog", href: "/wow/transmog", art: atlasScenes.transmog.art, position: "74% 45%" },
] as const;

export function WowHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const t = wowHomeCopy[locale];
  const href = (path: string) => `${locale === "ru" ? "/ru" : ""}${path}`;
  const season = liveSeason();

  return (
    <AtlasFrame lang={locale} scene="wow" dataAttributes={{ "data-wow-atlas": true }}>
        <AtlasHero
          align="start"
          eyebrow={season?.names[locale] ?? t.eyebrow}
          title={t.title}
          actions={<MaterialLinkButton kit={HERO_KIT} fit="stack" variant="primary" href={href("/wow/characters")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.character}</MaterialLinkButton>}
        />

      <AtlasSection id="sections">
        <div className={styles.cards}>
          {sections.map((section, index) => (
            <MaterialCard
              key={section.href}
              kit={CARD_KIT}
              href={href(section.href)}
              src={section.art}
              position={section.position}
              sizes="(max-width: 760px) 100vw, (max-width: 1199px) 50vw, 33vw"
              priority={index < 3}
              title={t.cards[section.key].title}
              text={t.cards[section.key].text}
              action={t.open}
            />
          ))}
        </div>
      </AtlasSection>

      <MaterialPlaque kit={HERO_KIT} as="section" className={styles.talents} aria-labelledby="wow-talents">
        <div>
          <h2 id="wow-talents" className={materialStyles.title}>{t.talents}</h2>
        </div>
        <MaterialLinkButton kit={HERO_KIT} fit="stack" href={href("/wow/classes")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.talentsAction}</MaterialLinkButton>
      </MaterialPlaque>
    </AtlasFrame>
  );
}
