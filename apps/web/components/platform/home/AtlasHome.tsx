import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AtlasFrame, AtlasLinkButton } from "@/components/atlas";
import { characterScene } from "@/components/wow/characters/characterScene";
import { sectionHref } from "@/lib/routes/registry";
import { artPlaceholder } from "@gildra/atlas-ui/placeholders";
import type { Lang } from "@/lib/i18n";
import { atlasHomeCopy } from "./atlasHomeCopy";
import styles from "./atlasHome.module.css";

/** The selected portal concept: character scene, open typography, continuous destinations. */
export async function AtlasHome({ lang }: { lang: Lang }) {
  const locale = lang === "ru" ? "ru" : "en";
  const copy = atlasHomeCopy[locale];
  const scene = await characterScene();
  const portalArt = scene.art.endsWith("icecrown-home-background-v1.webp");
  const art = portalArt ? "/assets/gildra/portal/hero-arthas.webp" : scene.art;
  return (
    <AtlasFrame lang={locale} fullBleed still className={styles.page} dataAttributes={{ "data-atlas-home": true }}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.scene} data-portal-art={portalArt || undefined} aria-hidden="true">
          {/* The tall phone crop needs the full optimized source, not a viewport-width thumbnail. */}
          <picture>
            <source media="(max-width: 700px)" srcSet={art} />
          <Image src={art} alt="" fill sizes={portalArt ? "100vw" : "(max-width: 700px) 100vw, 112vw"} quality={75} loading="eager" fetchPriority="high" {...artPlaceholder(art)} />
          </picture>
        </div>
        <div className={styles.intro}>
          <h1 id="home-title"><span>{copy.title}</span><span>{copy.titleAccent}</span></h1>
          <Image className={styles.divider} src="/assets/gildra/portal/divider.webp" width={600} height={33} alt="" sizes="240px" />
          <p className={styles.lede}>{copy.lede}</p>
          <div className={styles.actions}>
            <AtlasLinkButton href={sectionHref("characters", locale)} variant="primary" className={styles.primary} iconAfter={<ArrowRight size={23} strokeWidth={1} aria-hidden="true" />} prefetch={false}>{copy.characters}</AtlasLinkButton>
            <AtlasLinkButton href={sectionHref("wow", locale)} variant="ghost" className={styles.secondary} iconAfter={<ArrowRight size={23} strokeWidth={1} aria-hidden="true" />} prefetch={false}>{copy.overview}</AtlasLinkButton>
          </div>
        </div>
      </section>
      <nav className={styles.destinations} aria-label={copy.explore}>
        {copy.sections.map(section => <Link key={section.id} href={sectionHref(section.id, locale)} prefetch={false} className={styles.destination}>
          <Image src={`/assets/gildra/portal/${section.art}.webp`} alt="" fill quality={50} sizes="(max-width: 700px) 100vw, 36vw" />
          <span className={styles.destinationCopy}><span>{section.title}</span><ArrowRight size={30} strokeWidth={1} aria-hidden="true" /></span>
        </Link>)}
      </nav>
    </AtlasFrame>
  );
}
