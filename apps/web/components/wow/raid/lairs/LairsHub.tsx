import { ArrowRight, MapPin, Skull, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { midnightLairEncounters } from "@/lib/data/wow";
import { getBoss, lairGuideSourceUrl, type Boss } from "@/lib/lairs";
import { RaidFramedArt } from "../RaidFramedArt";
import { RaidLinkButton, RaidPlaque } from "../raidMaterial";
import page from "../raidPage.module.css";
import { lairsCopy, type LairsLocale } from "./lairsCopy";
import styles from "./lairs.module.css";
import { trail } from "@/lib/routes/registry";

/** Lairs and world bosses wear the Coiled Isle kit of The Venomous Abyss until they get their own. */
const kit = "venomous-abyss" as const;
const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function LairsHub({ locale = "ru" }: { locale?: LairsLocale }) {
  const copy = lairsCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const bosses = midnightLairEncounters
    .map((encounter) => ({ encounter, boss: getBoss(encounter.slug, locale) }))
    .filter((entry): entry is { encounter: typeof entry.encounter; boss: Boss } => Boolean(entry.boss));
  const lair = bosses.find(({ encounter }) => encounter.kind === "lair");
  const worldBosses = bosses.filter(({ encounter }) => encounter.kind === "world-boss");
  const worldExample = worldBosses[0]?.boss;
  const announcement = midnightLairEncounters[0]?.sourceUrl;

  return (
    <AtlasFrame lang={locale} scene="lairs" className={page.page} dataAttributes={{ "data-lairs-root": true }}>
      <AtlasHero
        className={page.hero}
        breadcrumbs={trail(locale, "lairs")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        actions={<div className={page.actions}>
          {lair ? <RaidLinkButton raid={kit} fit="stack" href="#lair" variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.lairSection}</RaidLinkButton> : null}
          <RaidLinkButton raid={kit} fit="stack" href="#world-bosses" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.worldSection}</RaidLinkButton>
        </div>}
        statsLabel={copy.statsLabel}
        stats={[
          { value: lair ? 1 : 0, label: copy.statLair },
          { value: worldBosses.length, label: copy.statWorld },
        ]}
      />

      {lair ? (
        <AtlasSection id="lair" title={copy.lairSection}>
          <article className={styles.feature} aria-labelledby={`lair-${lair.boss.slug}`}>
            <RaidFramedArt raid={kit} src={lair.boss.portrait} href={`${prefix}/wow/lairs/${lair.boss.slug}`} position="center 30%" priority sizes="(max-width: 1100px) 100vw, 50vw" />
            <RaidPlaque raid={kit} className={`${page.plaque} ${styles.featureBody}`}>
              <p className={styles.location}><MapPin aria-hidden="true" />{lair.boss.zone}</p>
              <h3 id={`lair-${lair.boss.slug}`} className={styles.cardTitle}><a href={`${prefix}/wow/lairs/${lair.boss.slug}`}>{lair.boss.name}</a></h3>
              <p className={styles.subtitle}>{lair.boss.title}</p>
              <p>{lair.boss.summary}</p>
              <ul className={styles.difficultyStrip}>
                {lair.boss.difficulties.map((difficulty) => (
                  <li key={difficulty.name}>
                    <strong>{capital(difficulty.name)}</strong>
                    <span>{difficulty.reward}</span>
                    <small>{difficulty.group}</small>
                  </li>
                ))}
              </ul>
              <p className={page.meta}><Swords aria-hidden="true" className={styles.metaIcon} />{copy.abilities(lair.boss.mechanics.length)} · {copy.items(lair.boss.loot.length)}</p>
              <div className={styles.cardAction}>
                <RaidLinkButton raid={kit} fit="block" href={`${prefix}/wow/lairs/${lair.boss.slug}`}>{copy.openGuide}<span className={styles.srOnly}>: {lair.boss.name}</span></RaidLinkButton>
              </div>
            </RaidPlaque>
          </article>
        </AtlasSection>
      ) : null}

      <AtlasSection id="world-bosses" title={copy.worldSection} description={worldExample?.difficulties[0]?.note}>
        <ul className={styles.worldGrid}>
          {worldBosses.map(({ boss }) => (
            <li key={boss.slug}>
              <article className={styles.worldCard} aria-labelledby={`world-${boss.slug}`}>
                <RaidFramedArt raid={kit} src={boss.portrait} href={`${prefix}/wow/lairs/${boss.slug}`} position="center 24%" sizes="(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 25vw" />
                <RaidPlaque raid={kit} className={`${page.plaque} ${styles.worldBody}`}>
                  <p className={styles.location}><MapPin aria-hidden="true" />{boss.zone}</p>
                  <h3 id={`world-${boss.slug}`} className={styles.cardTitle}><a href={`${prefix}/wow/lairs/${boss.slug}`}>{boss.name}</a></h3>
                  <p className={styles.subtitle}>{boss.title}</p>
                  <p className={page.meta}><Swords aria-hidden="true" className={styles.metaIcon} />{copy.abilities(boss.mechanics.length)}</p>
                  <div className={styles.cardAction}>
                    <RaidLinkButton raid={kit} fit="block" href={`${prefix}/wow/lairs/${boss.slug}`}>{copy.guide}<span className={styles.srOnly}>: {boss.name}</span></RaidLinkButton>
                  </div>
                </RaidPlaque>
              </article>
            </li>
          ))}
        </ul>
      </AtlasSection>

      <AtlasSection id="rewards" title={copy.rewardsSection} description={copy.rewardsText}>
        <div className={page.plaqueGrid}>
          {lair ? (
            <RaidPlaque raid={kit} as="article" aria-labelledby="rewards-lair" className={page.plaque}>
              <h3 id="rewards-lair" className={page.roleTitle}><Skull aria-hidden="true" />{copy.lairBadge}</h3>
              <dl className={page.facts}>
                <div><dt>{copy.access}</dt><dd>{lair.boss.farm.access}</dd></div>
                <div><dt>{copy.reset}</dt><dd>{lair.boss.reset}</dd></div>
                <div><dt>{copy.lockout}</dt><dd>{lair.boss.farm.lockout}</dd></div>
                <div><dt>{copy.bestReward}</dt><dd>{lair.boss.farm.best}</dd></div>
              </dl>
            </RaidPlaque>
          ) : null}
          {worldExample ? (
            <RaidPlaque raid={kit} as="article" aria-labelledby="rewards-world" className={page.plaque}>
              <h3 id="rewards-world" className={page.roleTitle}><Swords aria-hidden="true" />{copy.worldBadge}</h3>
              <dl className={page.facts}>
                <div><dt>{copy.access}</dt><dd>{worldExample.farm.access}</dd></div>
                <div><dt>{copy.reset}</dt><dd>{worldExample.reset}</dd></div>
                <div><dt>{copy.lockout}</dt><dd>{worldExample.farm.lockout}</dd></div>
                <div><dt>{copy.bestReward}</dt><dd>{worldExample.farm.best}</dd></div>
              </dl>
            </RaidPlaque>
          ) : null}
        </div>
        <p className={page.quiet}>
          {announcement ? <><a href={announcement} target="_blank" rel="noreferrer">{copy.blizzard} ↗</a> · </> : null}
          <a href={lairGuideSourceUrl} target="_blank" rel="noreferrer">{copy.icyVeins} ↗</a>
        </p>
      </AtlasSection>
    </AtlasFrame>
  );
}
