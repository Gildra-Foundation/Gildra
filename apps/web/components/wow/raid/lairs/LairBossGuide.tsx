import { wowGuideText } from "@/lib/wow/sourceLocale";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Crown, ExternalLink, Shield, Swords, UsersRound } from "lucide-react";
import { AtlasAnchorNav, AtlasBadge, AtlasFrame, AtlasHero, AtlasMetaList, AtlasSection, AtlasTable, type AtlasBadgeTone } from "@/components/atlas";
import { formatAtlasDate } from "@gildra/atlas-ui/format";
import { RaidFramedArt } from "../RaidFramedArt";
import { RaidPlaque, raidIconFrameStyle, raidMaterialStyles } from "../raidMaterial";
import page from "../raidPage.module.css";
import { getLootIcon, lairGuideLastVerifiedAt, type Boss, type Mechanic } from "@/lib/lairs";
import { CopyWaypointButton } from "./CopyWaypointButton";
import { lairsCopy, mechanicActions, type LairsLocale } from "./lairsCopy";
import styles from "./lairs.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { trail } from "@/lib/routes/registry";

const toneByMechanic: Record<Mechanic["tone"], AtlasBadgeTone> = { danger: "negative", frost: "info", control: "caution", tank: "neutral" };
const difficultyIcons = [UsersRound, Shield, Swords, Crown];

/** Lairs wear the Coiled Isle kit of The Venomous Abyss until they get their own. */
const kit = "venomous-abyss" as const;
const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

function spellAnchor(name: string) {
  return `spell-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function LairBossGuide({ boss, nextBoss, locale = "ru" }: { boss: Boss; nextBoss: Boss; locale?: LairsLocale }) {
  const copy = lairsCopy[locale];
  const actions = mechanicActions[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const kind = boss.kind === "lair" ? copy.lairType : copy.worldType;
  const positioning = boss.positioning ?? [];
  // A single-difficulty world boss repeats the facts next to the map; the
  // difficulty chapter (and its group composition) only earns a place on lairs.
  const showDifficulty = boss.difficulties.length > 1;
  const chapters = [
    { href: "#where", label: copy.whereChapter },
    { href: "#abilities", label: copy.abilitiesChapter, count: boss.mechanics.length },
    ...(positioning.length ? [{ href: "#positioning", label: copy.positioningChapter }] : []),
    ...(showDifficulty ? [{ href: "#difficulty", label: copy.difficultyChapter }] : []),
    { href: "#loot", label: copy.lootChapter, count: boss.loot.length },
  ];

  return (
    <AtlasFrame lang={locale} art={boss.portrait} artPosition="center 24%" artShade="deep" morphKey={`/wow/lairs/${boss.slug}`} dataAttributes={{ "data-lairs-root": true }}>
      <AtlasHero
        breadcrumbs={trail(locale, "lairs", { label: boss.name })}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<>{kind} · {boss.zone}</>}
        title={boss.name}
        lede={<><em className={styles.epithet}>{boss.title}.</em> {boss.summary}</>}
        actions={<>
          {boss.farm.waypoint ? <CopyWaypointButton waypoint={boss.farm.waypoint} labels={{ label: copy.copyWaypoint, copied: copy.copied, failed: copy.copyFailed }} /> : null}
          <AtlasShareButton title={boss.name} locale={locale} />
        </>}
      />

      <AtlasAnchorNav items={chapters} label={copy.chapters} />

      <AtlasSection id="where" title={copy.whereTitle}>
        <div className={styles.whereGrid}>
          <figure className={styles.framedMap} role="img" aria-label={copy.mapAlt(boss.zone)}>
            <RaidFramedArt raid={kit} src={boss.map} fit="contain" sizes="(max-width: 900px) 100vw, 60vw" />
            <figcaption>{boss.zone} · {boss.coordinates}</figcaption>
          </figure>
          <RaidPlaque raid={kit} className={page.plaque}>
            <dl className={page.facts}>
              <div><dt>{copy.access}</dt><dd>{boss.farm.access}</dd></div>
              <div><dt>{copy.reset}</dt><dd>{boss.reset}</dd></div>
              <div><dt>{copy.lockout}</dt><dd>{boss.farm.lockout}</dd></div>
              <div><dt>{copy.bestReward}</dt><dd>{boss.farm.best}</dd></div>
            </dl>
          </RaidPlaque>
        </div>
      </AtlasSection>

      <AtlasSection id="abilities" title={copy.abilitiesTitle} description={copy.abilitiesText}>
        <RaidPlaque raid={kit} className={page.plaque}>
        <ol className={styles.abilityList}>
          {boss.mechanics.map((mechanic) => {
            const tags = mechanic.tags ?? [mechanic.action];
            // The boss name and the page-wide source are already in the hero.
            const castBy = mechanic.castBy && mechanic.castBy !== boss.name ? mechanic.castBy : null;
            const source = mechanic.sourceUrl && mechanic.sourceUrl !== boss.sourceUrl ? mechanic.sourceUrl : null;
            return (
              <li key={mechanic.name} id={spellAnchor(mechanic.name)} className={styles.ability}>
                <span className={raidMaterialStyles.iconFrame} style={raidIconFrameStyle(kit, 56)}><Image src={mechanic.icon} alt="" width={56} height={56} /></span>
                <div className={styles.abilityBody}>
                  <div className={styles.abilityHead}>
                    <h3>{mechanic.spellId ? <a href={`https://www.wowhead.com/spell=${mechanic.spellId}`} target="_blank" rel="noreferrer">{mechanic.name}</a> : mechanic.name}</h3>
                    <div className={styles.abilityTags}>
                      {tags.map((tag) => <AtlasBadge key={tag} tone={toneByMechanic[mechanic.tone]}>{actions[tag]}</AtlasBadge>)}
                      <AtlasBadge tone="neutral">{copy.whoResponds}: {wowGuideText(mechanic.role, locale)}</AtlasBadge>
                    </div>
                  </div>
                  <p>{mechanic.description}</p>
                  <p className={styles.response}><strong>{copy.response}:</strong> {mechanic.response}</p>
                  {castBy || source ? (
                    <small className={styles.abilityMeta}>
                      {castBy}
                      {castBy && source ? " · " : null}
                      {source ? <a href={source} target="_blank" rel="noreferrer">{copy.source} ↗</a> : null}
                    </small>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        </RaidPlaque>
      </AtlasSection>

      {positioning.length ? (
        <AtlasSection id="positioning" title={copy.positioningTitle}>
          <div className={styles.positionGrid}>
            {positioning.map((item) => (
              <RaidPlaque raid={kit} key={item.label} as="article" className={page.plaque}>
                <h3>{item.label}</h3>
                <p>{item.text}</p>
              </RaidPlaque>
            ))}
          </div>
        </AtlasSection>
      ) : null}

      {showDifficulty ? (
      <AtlasSection id="difficulty" title={copy.difficultyTitle}>
        <div className={styles.difficultyGrid}>
          {boss.difficulties.map((difficulty, index) => {
            const Icon = difficultyIcons[index] ?? Shield;
            return (
              <RaidPlaque raid={kit} key={difficulty.name} as="article" className={page.plaque}>
                <h3 className={page.roleTitle}><Icon aria-hidden="true" />{capital(difficulty.name)}</h3>
                <p>{difficulty.note}</p>
                <dl className={`${page.facts} ${styles.difficultyFacts}`}>
                  <div><dt>{copy.group}</dt><dd>{difficulty.group}</dd></div>
                  <div><dt>{copy.reward}</dt><dd>{difficulty.reward}</dd></div>
                </dl>
              </RaidPlaque>
            );
          })}
        </div>
        <h3 className={styles.subheading}>{copy.compositionTitle}</h3>
        <AtlasMetaList columns={4} items={[
          { icon: <Shield />, label: copy.tanks, value: boss.composition.tanks },
          { icon: <Crown />, label: copy.healers, value: boss.composition.healers },
          { icon: <Swords />, label: copy.damage, value: boss.composition.dps },
          { icon: <UsersRound />, label: copy.size, value: boss.composition.size },
        ]} />
      </AtlasSection>
      ) : null}

      <AtlasSection id="loot" title={copy.lootTitle}>
        <RaidPlaque raid={kit} className={page.plaque}>
        <AtlasTable
          label={copy.lootTitle}
          layout="cards"
          className={styles.lootTable}
          rows={boss.loot}
          rowKey={(item) => item.name}
          columns={[
            {
              key: "item", header: copy.item, rowHeader: true,
              cell: (item) => (
                <span className={styles.lootItem}>
                  <Image src={getLootIcon(item.name)} alt="" width={36} height={36} />
                  {item.itemId ? <a href={`https://www.wowhead.com/item=${item.itemId}`} target="_blank" rel="noreferrer">{item.name}</a> : <span>{item.name}</span>}
                </span>
              ),
            },
            { key: "slot", header: copy.slot, cell: (item) => <span>{item.slot}<small className={styles.lootArmor}>{item.armor}</small></span> },
            { key: "stats", header: copy.stats, cell: (item) => item.stats },
            { key: "priority", header: copy.priority, cell: (item) => item.priority },
          ]}
        />
        </RaidPlaque>
        <p className={page.quiet}>
          {boss.sourceUrl ? <><a href={boss.sourceUrl} target="_blank" rel="noreferrer">{copy.strategySource}<ExternalLink aria-hidden="true" /></a> · </> : null}
          {copy.updated(formatAtlasDate(boss.lastVerifiedAt ?? lairGuideLastVerifiedAt, locale))}
        </p>
      </AtlasSection>

      <nav className={styles.pager} aria-label={copy.section}>
        <Link href={`${prefix}/wow/lairs`} className={styles.pagerBack}>{copy.allBosses}</Link>
        <Link href={`${prefix}/wow/lairs/${nextBoss.slug}`} className={styles.pagerNext}>
          <Image src={nextBoss.portrait} alt="" width={56} height={56} />
          <span><small>{copy.nextBoss}</small><strong>{nextBoss.name}</strong></span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </nav>
    </AtlasFrame>
  );
}

