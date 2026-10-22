import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, ArrowRight, ChartNoAxesColumnIncreasing, Swords } from "lucide-react";
import { AtlasFrame, AtlasLinkButton } from "@/components/atlas";
import { characterScene } from "@/components/wow/characters/characterScene";
import { atlasScenes } from "@/lib/atlas/scenes";
import { sectionHref } from "@/lib/routes/registry";
import { artPlaceholder } from "@gildra/atlas-ui/placeholders";
import type { Lang } from "@/lib/i18n";
import { SiteAppearance } from "./SiteAppearance";
import { atlasHomeCopy } from "./atlasHomeCopy";
import styles from "./atlasHome.module.css";

/** An illustrated atlas: the selected character gets the stage, destinations the foreground. */
export async function AtlasHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const copy = atlasHomeCopy[locale];
  const scene = await characterScene();
  return (
    <AtlasFrame lang={locale} art={scene.art} artPosition={scene.position} className={styles.page} dataAttributes={{ "data-atlas-home": true }}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.edition}>
          <span>Gildra <span className={styles.editionDivider} aria-hidden="true">/</span> {copy.atlas}</span>
          <span>World of Warcraft</span>
        </div>
        <div className={styles.heroBody}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="home-title">{copy.title}{" "}<em>{copy.titleAccent}</em></h1>
            <p className={styles.lede}>{copy.lede}</p>
            <div className={styles.actions}>
              <AtlasLinkButton href={sectionHref("characters", locale)} variant="primary" iconAfter={<ArrowRight size={18} aria-hidden="true" />} prefetch={false}>{copy.characters}</AtlasLinkButton>
              <AtlasLinkButton href={sectionHref("wow", locale)} variant="ghost" prefetch={false}>{copy.overview}</AtlasLinkButton>
            </div>
          </div>
        </div>
        <div className={styles.heroFoot}>
          <SiteAppearance locale={locale} label={copy.appearance} />
          <a href="#home-destinations" className={styles.discover}>{copy.discover}<ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </section>
      <section id="home-destinations" className={styles.destinations} aria-labelledby="home-explore-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}><span aria-hidden="true">01 /</span> {copy.panelEyebrow}</p>
          <h2 id="home-explore-title">{copy.panelTitle}</h2>
        </div>
        <div className={styles.journeys}>
          {copy.sections.map((section, index) => {
            const art = atlasScenes[section.id];
            return <Link key={section.id} href={sectionHref(section.id, locale)} prefetch={false} className={styles.journey} data-spotlight>
              <Image src={art.art} alt="" fill quality={50}
                sizes={index === 0 ? "(max-width: 700px) 100vw, (max-width: 1050px) 100vw, 46vw" : "(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 27vw"}
                style={{ objectPosition: art.position }} {...artPlaceholder(art.art)} />
              <span className={styles.journeyTop}><span>{section.category}</span><ArrowUpRight size={22} aria-hidden="true" /></span>
              <div className={styles.journeyCopy}>
                <span className={styles.journeyIndex} aria-hidden="true">0{index + 1}</span>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
            </Link>;
          })}
        </div>
        <div className={styles.fieldNotes}>
          <p>{copy.notes}</p>
          <Link href={sectionHref("tierLists", locale)} prefetch={false}><ChartNoAxesColumnIncreasing size={18} aria-hidden="true" /><span>{copy.tiers}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href={sectionHref("lairs", locale)} prefetch={false}><Swords size={18} aria-hidden="true" /><span>{copy.bosses}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>
    </AtlasFrame>
  );
}
