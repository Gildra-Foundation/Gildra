import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Skull } from "lucide-react";
import { Card } from "@gildra/atlas-ui/valyro-ui/data-display/Card";
import { AtlasMorphPreload } from "@gildra/atlas-ui/AtlasMorphPreload";
import { morphArtProps } from "@gildra/atlas-ui/morph";
import bridge from "@gildra/atlas-ui/valyroAtlasBridge.module.css";
import { raidAtlasCopy } from "./raidAtlasCopy";
import { raidReviewCopy } from "./raidReviewCopy";
import { raidHubEntries, type RaidHubLocale } from "./raidHubData";
import { raidHubFrameArtwork, raidHubFrameLayout } from "./raidHubFrames";
import styles from "./raidHubCards.module.css";

/** Valyro's composable Card retains real lists and independent boss links in every raid. */
export function RaidHubCards({ locale, section }: { locale: RaidHubLocale; section: "current" | "archive" }) {
  const copy = raidAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return <div className={section === "current" ? styles.current : styles.archive}>
    {raidHubEntries.filter((raid) => raid.section === section).map((raid) => {
      const href = `${prefix}/wow/raids/${raid.slug}`;
      const name = raid.names[locale];
      const featured = section === "current";
      const description = raid.slug === "sporefall" ? raidReviewCopy[locale].sporefallCard : featured ? raid.descriptions?.[locale] : undefined;
      const sizes = featured ? "(max-width: 850px) 100vw, 50vw" : "(max-width: 700px) 100vw, 50vw";
      return <Card
        key={raid.slug}
        padding="none"
        variant="outline"
        className={`${bridge.scope} ${styles.card} ${featured ? styles.featured : ""}`}
        style={{ ...raidHubFrameLayout(raid.slug), "--raid-card-accent": raid.accent } as CSSProperties}
        data-hub-raid-card={raid.slug}
        data-testid={raid.slug === "sporefall" ? "sporefall-identity-card" : undefined}
      >
        <article className={styles.content} aria-labelledby={`raid-hub-${raid.slug}`}>
          <Link className={styles.artLink} href={href} tabIndex={-1} aria-hidden="true">
            <div className={styles.frameCanvas}>
              <div className={styles.artWindow} data-hub-raid-art>
                <Image
                  src={raid.artwork}
                  alt=""
                  fill
                  sizes={sizes}
                  className={styles.sceneImage}
                  {...(raid.sceneArt ? morphArtProps(href) : {})}
                />
                <span className={styles.artShade} aria-hidden="true" />
              </div>
              <Image src={raidHubFrameArtwork(raid.slug)} alt="" fill sizes={sizes} className={styles.frameImage} aria-hidden="true" />
            </div>
          </Link>
          <div className={styles.body}>
            <div className={styles.kicker}>
              <span>{featured ? copy.currentText : copy.archiveText}</span>
              {raid.location ? <span className={styles.location}><MapPin aria-hidden="true" />{raid.location[locale]}</span> : null}
            </div>
            <h3 className={styles.title} id={`raid-hub-${raid.slug}`}><Link href={href}>{name}</Link></h3>
            <span className={styles.count}><Skull aria-hidden="true" />{copy.bossCount(raid.bosses.length)}</span>
            {description ? <p className={`${styles.description} ${raid.slug === "sporefall" ? styles.reviewed : ""}`}>{description}</p> : null}
            <div className={styles.encounters}>
              <p className={styles.bossesLabel}>{copy.bossesLabel}</p>
              <ol className={styles.bosses} aria-label={copy.bossesLabel}>
                {raid.bosses.map((boss) => <li key={boss.slug}>
                  <Link href={`${href}/${boss.slug}`} data-hub-boss-link={`${raid.slug}/${boss.slug}`}>
                    {boss.artwork ? <Image src={boss.artwork} alt="" width={32} height={32} className={styles.portrait} /> : <Skull className={styles.bossIcon} aria-hidden="true" />}
                    <span>{boss.names[locale]}</span>
                  </Link>
                </li>)}
              </ol>
            </div>
            <footer className={styles.footer}>
              <Link className={styles.openRaid} href={href} aria-label={`${copy.openRaid}: ${name}`}>{copy.openRaid}<ArrowUpRight aria-hidden="true" /></Link>
              {raid.sourceUrl ? <a className={styles.source} href={raid.sourceUrl} target="_blank" rel="noreferrer">{copy.officialSource}<ArrowUpRight aria-hidden="true" /></a> : null}
            </footer>
          </div>
          {raid.sceneArt ? <AtlasMorphPreload art={raid.sceneArt} /> : null}
        </article>
      </Card>;
    })}
  </div>;
}
