import { CalendarClock, Gem, MapPin, ShieldCheck, Skull, Swords, UsersRound } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasMetaList, AtlasPanel, AtlasSection } from "@/components/atlas";
import { midnightLairEncounters } from "@/data/wow/midnight-lairs";
import { getBoss, lairGuideLastVerifiedAt, lairGuideSourceUrl, type Boss } from "@/lib/lairs";
import { lairsCopy, type LairsLocale } from "./lairsCopy";
import styles from "./lairs.module.css";

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
    <AtlasFrame lang={locale} scene="lairs" dataAttributes={{ "data-lairs-root": true }}>
      <AtlasHero
        align="center"
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.section }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={[
          { value: lair ? 1 : 0, label: copy.statLair },
          { value: worldBosses.length, label: copy.statWorld },
          { value: lair?.encounter.patch ?? "12.1", label: copy.statPatch },
        ]}
      />

      {lair ? (
        <AtlasSection id="lair" title={copy.lairSection} description={copy.lairSectionText}>
          <AtlasCard
            layout="feature"
            headingLevel={3}
            href={`${prefix}/wow/lairs/${lair.boss.slug}`}
            image={{ src: lair.boss.portrait, alt: lair.boss.name, priority: true, position: "center 62%" }}
            accent={lair.boss.accent}
            eyebrow={<><MapPin aria-hidden="true" />{lair.boss.zone}</>}
            title={lair.boss.name}
            subtitle={lair.boss.title}
            description={lair.boss.summary}
            meta={[
              { icon: <Swords aria-hidden="true" />, label: copy.abilities(lair.boss.mechanics.length) },
              { icon: <Gem aria-hidden="true" />, label: copy.items(lair.boss.loot.length) },
              { icon: <CalendarClock aria-hidden="true" />, label: lair.boss.reset },
            ]}
            cta={copy.openGuide}
          >
            <ul className={styles.difficultyStrip}>
              {lair.boss.difficulties.map((difficulty) => (
                <li key={difficulty.name}>
                  <strong>{difficulty.name}</strong>
                  <span>{difficulty.reward}</span>
                  <small>{difficulty.group}</small>
                </li>
              ))}
            </ul>
          </AtlasCard>
        </AtlasSection>
      ) : null}

      <AtlasSection id="world-bosses" title={copy.worldSection} description={worldExample?.difficulties[0]?.note}>
        <AtlasGrid min={260} fit>
          {worldBosses.map(({ boss }) => (
            <AtlasCard
              key={boss.slug}
              href={`${prefix}/wow/lairs/${boss.slug}`}
              image={{ src: boss.portrait, alt: boss.name, position: "center 24%", sizes: "(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 25vw" }}
              artRatio="4 / 3.6"
              tilt
              accent={boss.accent}
              eyebrow={<><MapPin aria-hidden="true" />{boss.zone}</>}
              title={boss.name}
              subtitle={boss.title}
              description={boss.summary}
              meta={[{ icon: <Swords aria-hidden="true" />, label: copy.abilities(boss.mechanics.length) }]}
              cta={copy.guide}
            />
          ))}
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="rewards" title={copy.rewardsSection} description={copy.rewardsText}>
        <div className={styles.rewardsGrid}>
          {lair ? (
            <AtlasPanel padding="none" as="article" aria-labelledby="rewards-lair">
              <h3 id="rewards-lair" className={styles.panelTitle}><Skull aria-hidden="true" />{copy.lairBadge}</h3>
              <AtlasMetaList columns={1} className={styles.flushList} items={[
                { icon: <UsersRound />, label: copy.access, value: lair.boss.farm.access },
                { icon: <CalendarClock />, label: copy.reset, value: lair.boss.reset },
                { icon: <Gem />, label: copy.lockout, value: lair.boss.farm.lockout },
                { icon: <ShieldCheck />, label: copy.bestReward, value: lair.boss.farm.best },
              ]} />
            </AtlasPanel>
          ) : null}
          {worldExample ? (
            <AtlasPanel padding="none" as="article" aria-labelledby="rewards-world">
              <h3 id="rewards-world" className={styles.panelTitle}><Swords aria-hidden="true" />{copy.worldBadge}</h3>
              <AtlasMetaList columns={1} className={styles.flushList} items={[
                { icon: <MapPin />, label: copy.access, value: worldExample.farm.access },
                { icon: <CalendarClock />, label: copy.reset, value: worldExample.reset },
                { icon: <Gem />, label: copy.lockout, value: worldExample.farm.lockout },
                { icon: <ShieldCheck />, label: copy.bestReward, value: worldExample.farm.best },
              ]} />
            </AtlasPanel>
          ) : null}
        </div>
        <footer className={styles.sources}>
          <p><strong>{copy.sources}.</strong> {copy.sourcesText(lairGuideLastVerifiedAt)}</p>
          <div>
            {announcement ? <AtlasLinkButton variant="ghost" size="sm" href={announcement} external>{copy.blizzard} ↗</AtlasLinkButton> : null}
            <AtlasLinkButton variant="ghost" size="sm" href={lairGuideSourceUrl} external>{copy.icyVeins} ↗</AtlasLinkButton>
          </div>
        </footer>
      </AtlasSection>
    </AtlasFrame>
  );
}
