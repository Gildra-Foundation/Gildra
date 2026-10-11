import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Crown, ExternalLink, Gem, MapPin, Shield, Skull, Swords, UsersRound } from "lucide-react";
import { AtlasAnchorNav, AtlasBadge, AtlasFrame, AtlasHero, AtlasLinkButton, AtlasMetaList, AtlasPanel, AtlasSection, type AtlasBadgeTone } from "@/components/atlas";
import { getLootIcon, lairGuideLastVerifiedAt, type Boss, type Mechanic } from "@/lib/lairs";
import { CopyWaypointButton } from "./CopyWaypointButton";
import { lairsCopy, mechanicActions, type LairsLocale } from "./lairsCopy";
import styles from "./lairs.module.css";

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
  const chapters = [
    { href: "#where", label: copy.whereChapter },
    { href: "#abilities", label: copy.abilitiesChapter, count: boss.mechanics.length },
    ...(positioning.length ? [{ href: "#positioning", label: copy.positioningChapter }] : []),
    { href: "#difficulty", label: copy.difficultyChapter },
    { href: "#loot", label: copy.lootChapter, count: boss.loot.length },
  ];

  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-lairs-root": true }}>
      <AtlasHero
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.section, href: `${prefix}/wow/lairs` }, { label: boss.name }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblem={boss.kind === "lair" ? <Skull /> : <Swords />}
        emblemShape="diamond"
        eyebrow={<>{kind} · {boss.zone}</>}
        title={boss.name}
        lede={<><em className={styles.epithet}>{boss.title}.</em> {boss.summary}</>}
        actions={<>
          {boss.farm.waypoint ? <CopyWaypointButton waypoint={boss.farm.waypoint} labels={{ label: copy.copyWaypoint, copied: copy.copied, failed: copy.copyFailed }} /> : null}
          {boss.sourceUrl ? <AtlasLinkButton variant="ghost" href={boss.sourceUrl} external iconAfter={<ExternalLink aria-hidden="true" />}>{copy.strategySource}</AtlasLinkButton> : null}
        </>}
        aside={(
          <figure className={styles.portrait} style={{ "--boss-accent": boss.accent } as React.CSSProperties}>
            <Image src={boss.portrait} alt={boss.name} fill priority sizes="(max-width: 1100px) 100vw, 340px" />
            <figcaption>“{boss.flavor}”</figcaption>
          </figure>
        )}
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
            return (
              <li key={mechanic.name} id={spellAnchor(mechanic.name)} className={styles.ability}>
                <Image className={styles.abilityIcon} src={mechanic.icon} alt="" width={52} height={52} />
                <div className={styles.abilityBody}>
                  <div className={styles.abilityHead}>
                    <h3>{mechanic.spellId ? <a href={`https://www.wowhead.com/spell=${mechanic.spellId}`} target="_blank" rel="noreferrer">{mechanic.name}</a> : mechanic.name}</h3>
                    <div className={styles.abilityTags}>
                      {tags.map((tag) => <AtlasBadge key={tag} tone={toneByMechanic[mechanic.tone]}>{actions[tag]}</AtlasBadge>)}
                      <AtlasBadge tone="neutral">{copy.whoResponds}: {mechanic.role}</AtlasBadge>
                    </div>
                  </div>
                  <p>{mechanic.description}</p>
                  <p className={styles.response}><strong>{copy.response}:</strong> {mechanic.response}</p>
                  {mechanic.castBy || mechanic.sourceUrl ? (
                    <small className={styles.abilityMeta}>
                      {mechanic.castBy ? mechanic.castBy : null}
                      {mechanic.castBy && mechanic.sourceUrl ? " · " : null}
                      {mechanic.sourceUrl ? <a href={mechanic.sourceUrl} target="_blank" rel="noreferrer">{copy.source} ↗</a> : null}
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

      <AtlasSection id="loot" title={copy.lootTitle}>
        <div className={styles.lootScroller}>
          <table className={styles.loot}>
            <thead>
              <tr><th scope="col">{copy.item}</th><th scope="col">{copy.slot}</th><th scope="col">{copy.stats}</th><th scope="col">{copy.priority}</th></tr>
            </thead>
            <tbody>
              {boss.loot.map((item) => (
                <tr key={item.name}>
                  <th scope="row">
                    <span className={styles.lootItem}>
                      <Image src={getLootIcon(item.name)} alt="" width={36} height={36} />
                      {item.itemId ? <a href={`https://www.wowhead.com/item=${item.itemId}`} target="_blank" rel="noreferrer">{item.name}</a> : <span>{item.name}</span>}
                    </span>
                  </th>
                  <td>{item.slot}<small>{item.armor}</small></td>
                  <td>{item.stats}</td>
                  <td>{item.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

