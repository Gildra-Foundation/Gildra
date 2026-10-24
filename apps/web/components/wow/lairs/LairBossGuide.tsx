import { wowGuideText } from "@/lib/wow/sourceLocale";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Crown, ExternalLink, Gem, MapPin, Shield, Swords, UsersRound } from "lucide-react";
import { AtlasAnchorNav, AtlasBadge, AtlasFrame, AtlasHero, AtlasLinkButton, AtlasMetaList, AtlasPanel, AtlasSection, AtlasTable, type AtlasBadgeTone } from "@/components/atlas";
import { getLootIcon, lairGuideLastVerifiedAt, type Boss, type Mechanic } from "@/lib/lairs";
import { CopyWaypointButton } from "./CopyWaypointButton";
import { lairsCopy, mechanicActions, type LairsLocale } from "./lairsCopy";
import styles from "./lairs.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { trail } from "@/lib/routes/registry";

const toneByMechanic: Record<Mechanic["tone"], AtlasBadgeTone> = { danger: "negative", frost: "info", control: "caution", tank: "neutral" };
const difficultyIcons = [UsersRound, Shield, Swords, Crown];

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
          {boss.sourceUrl ? <AtlasLinkButton variant="ghost" href={boss.sourceUrl} external iconAfter={<ExternalLink aria-hidden="true" />}>{copy.strategySource}</AtlasLinkButton> : null}
        </>}
      />

      <AtlasAnchorNav items={chapters} label={copy.chapters} />

      <AtlasSection id="where" title={copy.whereTitle}>
        <div className={styles.whereGrid}>
          <figure className={styles.map}>
            <Image src={boss.map} alt={copy.mapAlt(boss.zone)} fill sizes="(max-width: 900px) 100vw, 60vw" />
            <figcaption><MapPin aria-hidden="true" />{boss.zone} · {boss.coordinates}</figcaption>
          </figure>
          <AtlasPanel padding="none">
            <AtlasMetaList columns={1} className={styles.flushList} items={[
              { icon: <MapPin />, label: copy.access, value: boss.farm.access },
              { icon: <CalendarClock />, label: copy.reset, value: boss.reset },
              { icon: <Gem />, label: copy.lockout, value: boss.farm.lockout },
              { icon: <Crown />, label: copy.bestReward, value: boss.farm.best },
            ]} />
          </AtlasPanel>
        </div>
      </AtlasSection>

      <AtlasSection id="abilities" title={copy.abilitiesTitle} description={copy.abilitiesText}>
        <ol className={styles.abilityList}>
          {boss.mechanics.map((mechanic) => {
            const tags = mechanic.tags ?? [mechanic.action];
            // The boss name and the page-wide source are already in the hero.
            const castBy = mechanic.castBy && mechanic.castBy !== boss.name ? mechanic.castBy : null;
            const source = mechanic.sourceUrl && mechanic.sourceUrl !== boss.sourceUrl ? mechanic.sourceUrl : null;
            return (
              <li key={mechanic.name} id={spellAnchor(mechanic.name)} className={styles.ability}>
                <Image className={styles.abilityIcon} src={mechanic.icon} alt="" width={52} height={52} />
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
      </AtlasSection>

      {positioning.length ? (
        <AtlasSection id="positioning" title={copy.positioningTitle}>
          <div className={styles.positionGrid}>
            {positioning.map((item) => (
              <AtlasPanel key={item.label} tone="raised" as="article" className={styles.position}>
                <h3>{item.label}</h3>
                <p>{item.text}</p>
              </AtlasPanel>
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
              <AtlasPanel key={difficulty.name} as="article" tone={index === boss.difficulties.length - 1 && boss.difficulties.length > 1 ? "highlight" : "default"} className={styles.difficulty}>
                <span className={styles.difficultyIcon} aria-hidden="true"><Icon /></span>
                <h3>{difficulty.name}</h3>
                <p>{difficulty.note}</p>
                <dl>
                  <div><dt>{copy.group}</dt><dd>{difficulty.group}</dd></div>
                  <div><dt>{copy.reward}</dt><dd>{difficulty.reward}</dd></div>
                </dl>
              </AtlasPanel>
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
        <AtlasTable
          label={copy.lootTitle}
          layout="cards"
          className={styles.lootTable}
          rows={boss.loot}
          rowKey={(item) => item.name}
          columns={[
            {
              key: "item", header: copy.item, rowHeader: true,
              cell: (item) => {
                const icon = getLootIcon(item.name);
                return (
                <span className={styles.lootItem}>
                  {icon ? <Image src={icon} alt="" width={36} height={36} /> : null}
                  {item.itemId ? <a href={`https://www.wowhead.com/item=${item.itemId}`} target="_blank" rel="noreferrer">{item.name}</a> : <span>{item.name}</span>}
                </span>
              ); },
            },
            { key: "slot", header: copy.slot, cell: (item) => <span>{item.slot}<small className={styles.lootArmor}>{item.armor}</small></span> },
            { key: "stats", header: copy.stats, cell: (item) => item.stats },
          ]}
        />
        <p className={styles.footnote}>{copy.lootNote(boss.lastVerifiedAt ?? lairGuideLastVerifiedAt)}</p>
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

