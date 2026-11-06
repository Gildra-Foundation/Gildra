import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ListOrdered, Repeat, Sparkles } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT, TALENTS_KIT } from "@/lib/wow/charactersKit";
import { getMidnightClassSpecs } from "@/lib/data/wow";
import { armorWords, classArmor, specResource, specStrengths, strengthWords } from "@/lib/data/wow/classFacts";
import { loadSpecBoard, loadSpecTiers, type SpecBoard, type SpecTier, type TierActivity, type TierSource } from "@/lib/games/wow/classMeta";
import { itemIconUrl, type LeaderboardItem } from "@/lib/games/wow/mplusLeaderboardView";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { trail } from "@/lib/routes/registry";
import { classCopy, type ClassCopy } from "./classCopy";
import { CopyBuildButton } from "./ClassClient";
import {
  HeroShares, RoleBadge, TierChip, boardHref, buildHref, classColorStyle, classHref, className, formatScore, formatShare, heroTreeName,
  rotationHref, specHref, specName, talentsHref, type Locale, type SpecEntry,
} from "./ClassParts";
import styles from "./classCatalog.module.css";

const tierRows: TierActivity[] = ["mythic_plus", "raid"];
const tierColumns: TierSource[] = ["gildra", "mythicstats", "ugg"];

/** /wow/classes/<class>/<spec>: role and strengths, tier in every list, what the top players build and wear. */
export async function SpecPage({ locale, spec }: { locale: Locale; spec: SpecEntry }) {
  const copy = classCopy[locale];
  const [tiers, board] = await Promise.all([loadSpecTiers(), loadSpecBoard(spec, true)]);
  const name = specName(spec, locale);
  const cls = className(spec, locale);
  const siblings = getMidnightClassSpecs(spec.classSlug).filter((item) => item.slug !== spec.slug);

  return (
    <AtlasFrame lang={locale} scene="classes">
      <div style={classColorStyle(spec.classKey)}>
        <AtlasHero
          breadcrumbs={trail(locale, "classes", { label: cls, href: classHref(locale, spec.classSlug) }, { label: name })}
          breadcrumbsLabel={copy.breadcrumbs}
          emblem={<Image className={styles.specIcon} src={spec.iconUrl} alt="" width={64} height={64} priority />}
          title={copy.specTitle(name, cls)}
          actions={
            <div className={styles.linkRow}>
              <MaterialLinkButton kit={TALENTS_KIT} fit="stack" variant="primary" href={talentsHref(locale, spec.slug)} icon={<Sparkles aria-hidden="true" />}>{copy.talents}</MaterialLinkButton>
              <MaterialLinkButton kit={KIT} fit="stack" href={rotationHref(locale, spec.slug)} icon={<Repeat aria-hidden="true" />}>{copy.rotation}</MaterialLinkButton>
              <MaterialLinkButton kit={KIT} fit="stack" href={boardHref(locale, spec.slug)} icon={<ListOrdered aria-hidden="true" />}>{copy.leaderboard}</MaterialLinkButton>
            </div>
          }
        />

        <AtlasSection id="overview">
          <div className={styles.overview}>
            <MaterialPlaque as="section" kit={KIT} className={styles.specCard} aria-labelledby="spec-facts">
              <h2 id="spec-facts" className={styles.panelTitle}>{copy.strengths}</h2>
              <ul className={styles.strengths}>
                {specStrengths[spec.slug]?.map((key) => <li key={key}>{strengthWords[key][locale]}</li>)}
              </ul>
              <dl className={styles.facts}>
                <dt>{copy.role}</dt><dd><RoleBadge role={spec.role} copy={copy} /></dd>
                <dt>{copy.armor}</dt><dd>{armorWords[classArmor[spec.classKey]][locale]}</dd>
                <dt>{copy.resource}</dt><dd>{specResource[spec.slug]?.[locale]}</dd>
                <dt>{copy.heroTrees}</dt><dd><HeroShares board={board ?? undefined} spec={spec} locale={locale} copy={copy} /></dd>
              </dl>
            </MaterialPlaque>
            <TierPlaque tiers={tiers[spec.slug]} copy={copy} />
          </div>
        </AtlasSection>

        {board?.builds.length ? <Builds board={board} spec={spec} locale={locale} copy={copy} /> : null}

        {board && (board.trinkets.length || board.weapons.length) ? (
          <AtlasSection id="gear">
            <div className={styles.gear}>
              <ItemPlaque id="gear-trinkets" title={copy.trinketsTitle} items={board.trinkets} locale={locale} copy={copy} />
              <ItemPlaque id="gear-weapons" title={copy.weaponsTitle} items={board.weapons} locale={locale} copy={copy} />
            </div>
          </AtlasSection>
        ) : null}

        <AtlasSection id="other-specs" title={copy.otherSpecs}>
          <ul className={styles.siblings}>
            {siblings.map((item) => (
              <li key={item.slug}><Link className={styles.sibling} href={specHref(locale, item)}><Image src={item.iconUrl} alt="" width={32} height={32} />{specName(item, locale)}</Link></li>
            ))}
            <li><Link className={styles.sibling} href={classHref(locale, spec.classSlug)}><Image src={spec.classIconUrl} alt="" width={32} height={32} />{cls}</Link></li>
          </ul>
        </AtlasSection>
      </div>
    </AtlasFrame>
  );
}

function TierPlaque({ tiers, copy }: { tiers?: SpecTier[]; copy: ClassCopy }) {
  if (!tiers?.length) return null;
  const columns = tierColumns.filter((source) => tiers.some((item) => item.source === source));
  return (
    <MaterialPlaque as="section" kit={KIT} className={styles.specCard} aria-labelledby="spec-tiers">
      <h2 id="spec-tiers" className={styles.panelTitle}>{copy.tiersTitle}</h2>
      <table className={styles.tierTable}>
        <thead><tr><td />{columns.map((source) => <th key={source} scope="col">{copy.sources[source]}</th>)}</tr></thead>
        <tbody>
          {tierRows.filter((activity) => tiers.some((item) => item.activity === activity)).map((activity) => (
            <tr key={activity}>
              <th scope="row">{copy.activities[activity]}</th>
              {columns.map((source) => {
                const tier = tiers.find((item) => item.source === source && item.activity === activity);
                return (
                  <td key={source}>
                    {tier
                      ? <span className={styles.tierCell}><TierChip tier={tier.tier} /><small title={copy.rankOf(tier.rank, tier.total)}><span aria-hidden="true">#{tier.rank}</span><span className={styles.srOnly}>{copy.rankOf(tier.rank, tier.total)}</span></small></span>
                      : <span className={styles.dash} aria-hidden="true">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </MaterialPlaque>
  );
}

function Builds({ board, spec, locale, copy }: { board: SpecBoard; spec: SpecEntry; locale: Locale; copy: ClassCopy }) {
  return (
    <AtlasSection id="builds" title={copy.buildsTitle}>
      <ol className={styles.builds}>
        {board.builds.map((build, index) => {
          const hero = build.heroId ? heroTreeName(spec, build.heroId, locale) : "";
          return (
            <MaterialPlaque as="li" kit={TALENTS_KIT} key={build.loadout} className={styles.build} aria-labelledby={`build-${index}`}>
              <div className={styles.buildHead}>
                <h3 id={`build-${index}`}>{hero || name(spec, locale)}</h3>
                <span className={styles.buildShare} aria-label={copy.share(formatShare(build.share, copy))}>{formatShare(build.share, copy)}</span>
              </div>
              <span className={styles.track} aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, Math.round(build.share * 100))}%` } as CSSProperties} /></span>
              <ul className={styles.players}>
                {build.players.map((player) => (
                  <li key={`${player.region}-${player.realm}-${player.name}`}>
                    <span><b>{player.name}</b> · {(locale === "ru" && player.realmRu) || player.realm}</span>
                    <em>{formatScore(player.score, copy)}</em>
                  </li>
                ))}
              </ul>
              <div className={styles.buildActions}>
                <CopyBuildButton loadout={build.loadout} labels={{ copy: copy.copy, copied: copy.copied, failed: copy.copyFailed }} />
                <Link className={styles.buildAction} href={buildHref(locale, spec.slug, build.loadout, build.heroId)} prefetch={false}><Sparkles aria-hidden="true" />{copy.openInCalculator}</Link>
              </div>
            </MaterialPlaque>
          );
        })}
      </ol>
    </AtlasSection>
  );
}

const name = (spec: SpecEntry, locale: Locale) => specName(spec, locale);

const qualities = Object.values(itemQualityColors);
const qualityStyle = (quality?: string) => {
  const entry = qualities.find((item) => item.name === quality);
  return entry ? ({ "--quality-frame": entry.frame, "--quality-color": entry.text } as CSSProperties) : undefined;
};

function ItemPlaque({ id, title, items, locale, copy }: { id: string; title: string; items: LeaderboardItem[]; locale: Locale; copy: ClassCopy }) {
  if (!items.length) return null;
  return (
    <MaterialPlaque as="section" kit={KIT} className={styles.specCard} aria-labelledby={id}>
      <h2 id={id} className={styles.panelTitle}>{title}</h2>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.id} className={styles.item} style={qualityStyle(item.quality)}>
            {item.icon ? <img src={itemIconUrl(item.icon)} alt="" width={36} height={36} loading="lazy" decoding="async" /> : <span />}
            <span className={styles.itemText}>
              <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}item=${item.id}`} target="_blank" rel="noreferrer">{(locale === "ru" && item.nameRu) || item.name}</a>
              <span className={styles.track} aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, Math.round(item.share * 100))}%` }} /></span>
            </span>
            <span className={styles.itemShare}>{formatShare(item.share, copy)}</span>
          </li>
        ))}
      </ul>
    </MaterialPlaque>
  );
}
