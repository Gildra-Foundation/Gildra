import Link from "next/link";
import { ArrowRight, ChartNoAxesColumnIncreasing, Compass, ScrollText, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasPanel } from "@/components/atlas";
import { characterScene } from "@/components/wow/characters/characterScene";
import { sectionHref } from "@/lib/routes/registry";
import type { Lang } from "@/lib/i18n";
import { SiteAppearance } from "./SiteAppearance";
import { atlasHomeCopy } from "./atlasHomeCopy";
import styles from "./atlasHome.module.css";

const icons = [Compass, Swords, ChartNoAxesColumnIncreasing, ScrollText];

/** The same open hero, character artwork and glass surface as Characters. */
export async function AtlasHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const copy = atlasHomeCopy[locale];
  const scene = await characterScene();
  return (
    <AtlasFrame lang={locale} art={scene.art} artPosition={scene.position} artShade="deep" className={styles.page} dataAttributes={{ "data-atlas-home": true }}>
      <AtlasHero
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        toolbar={<SiteAppearance locale={locale} label={copy.appearance} />}
        actions={<>
          <AtlasLinkButton href={sectionHref("characters", locale)} variant="primary" iconAfter={<ArrowRight size={18} aria-hidden="true" />} prefetch={false}>{copy.characters}</AtlasLinkButton>
          <AtlasLinkButton href={sectionHref("wow", locale)} variant="ghost" prefetch={false}>{copy.overview}</AtlasLinkButton>
        </>}
        aside={
          <AtlasPanel as="section" padding="lg" className={styles.explore} aria-labelledby="home-explore-title">
            <div>
              <p className={styles.eyebrow}>{copy.panelEyebrow}</p>
              <h2 id="home-explore-title">{copy.panelTitle}</h2>
            </div>
            <ul className={styles.sections}>
              {copy.sections.map((section, index) => {
                const Icon = icons[index];
                return <li key={section.id}>
                  <Link href={sectionHref(section.id, locale)} prefetch={false}>
                    <Icon size={20} aria-hidden="true" />
                    <span><strong>{section.title}</strong><span>{section.description}</span></span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>;
              })}
            </ul>
          </AtlasPanel>
        }
      />
    </AtlasFrame>
  );
}
