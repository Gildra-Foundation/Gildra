import Image from "next/image";
import Link from "next/link";
import { ListOrdered, Sparkles, Trophy } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT } from "@/lib/wow/charactersKit";
import { midnightSpecializations } from "@/lib/data/wow";
import { armorWords, classArmor } from "@/lib/data/wow/classFacts";
import { loadSpecBoards, loadSpecTiers, type SpecBoard, type SpecTier } from "@/lib/games/wow/classMeta";
import { trail } from "@/lib/routes/registry";
import { classCopy, type ClassCopy } from "./classCopy";
import { RoleFilter } from "./ClassClient";
import {
  HeroShares, RoleBadge, TierChip, boardHref, classColorStyle, classHref, formatScore, mythicTier, specHref, specName, talentsHref,
  type Locale, type SpecEntry,
} from "./ClassParts";
import styles from "./classCatalog.module.css";
import { JsonLd, itemListLd } from "@/lib/seo/jsonld";

const roleGroup = (role: SpecEntry["role"]) => (role === "tank" || role === "healer" ? role : "dps");

/** Every playable class in the game's order: a painted plaque with its specializations, their tier and what top players pick. */
export async function ClassCatalogPage({ locale }: { locale: Locale }) {
  const copy = classCopy[locale];
  const [tiers, boards] = await Promise.all([loadSpecTiers(), loadSpecBoards(midnightSpecializations)]);
  const bySlug = new Map<string, SpecEntry[]>();
  for (const spec of midnightSpecializations) bySlug.set(spec.classSlug, [...(bySlug.get(spec.classSlug) ?? []), spec]);
  const classes = [...bySlug.values()].sort((left, right) => left[0].classId - right[0].classId);

  return (
    <AtlasFrame lang={locale} scene="classes">
      <JsonLd data={itemListLd(copy.title, classes.map((specs) => ({ name: locale === "ru" ? specs[0].classNameRu : specs[0].className, href: `${locale === "ru" ? "/ru" : ""}/wow/classes/${specs[0].classSlug}` })), false)} />
      <AtlasHero
        breadcrumbs={trail(locale, "classes")}
        breadcrumbsLabel={copy.breadcrumbs}
        title={copy.title}
        actions={<RoleFilter target="class-roster" label={copy.roleFilter} labels={copy.filters} />}
      />

      <AtlasSection id="classes">
        <ul className={styles.roster} id="class-roster" data-role-filter="all">
          {classes.map((specs) => {
            const first = specs[0];
            const name = locale === "ru" ? first.classNameRu : first.className;
            return (
              <MaterialPlaque as="li" kit={KIT} key={first.classSlug} id={first.classSlug} className={styles.classCard} style={classColorStyle(first.classKey)} aria-labelledby={`${first.classSlug}-name`}>
                <div className={styles.classHead}>
                  <span className={`${materialStyles.iconFrame} ${styles.classIcon}`} style={materialIconFrameStyle(KIT, 56)}>
                    <Image src={first.classIconUrl} alt="" width={56} height={56} />
                  </span>
                  <span className={styles.classTitle}>
                    <h2 id={`${first.classSlug}-name`} className={styles.className}><Link href={classHref(locale, first.classSlug)}>{name}</Link></h2>
                    <span className={styles.classMeta}>{armorWords[classArmor[first.classKey]][locale]}</span>
                  </span>
                </div>
                <ul className={styles.specRows} aria-label={copy.specsOf(name)}>
                  {specs.map((spec) => <SpecRow key={spec.slug} spec={spec} tiers={tiers[spec.slug]} board={boards[spec.slug]} locale={locale} copy={copy} />)}
                </ul>
              </MaterialPlaque>
            );
          })}
        </ul>
      </AtlasSection>
    </AtlasFrame>
  );
}

function SpecRow({ spec, tiers, board, locale, copy }: { spec: SpecEntry; tiers?: SpecTier[]; board?: SpecBoard; locale: Locale; copy: ClassCopy }) {
  const tier = mythicTier(tiers);
  return (
    <li className={styles.specRow} data-role={roleGroup(spec.role)}>
      <Image className={styles.specIcon} src={spec.iconUrl} alt="" width={40} height={40} />
      <span className={styles.specMain}>
        <span className={styles.specLine}>
          <Link className={styles.specName} href={specHref(locale, spec)}>{specName(spec, locale)}</Link>
          <RoleBadge role={spec.role} copy={copy} />
        </span>
        <HeroShares board={board} spec={spec} locale={locale} copy={copy} />
        {board?.top ? (
          <span className={styles.topPlayer}>
            <Trophy aria-hidden="true" /><span className={styles.srOnly}>{copy.topPlayer}: </span>
            <b>{board.top.name}</b><span>{formatScore(board.top.score, copy)}</span>
          </span>
        ) : null}
      </span>
      <span className={styles.specSide}>
        {tier ? <span className={styles.tierPair}><span aria-hidden="true">M+</span><TierChip tier={tier.tier} label={copy.tierAria(tier.tier)} /></span> : null}
        <span className={styles.quickLinks}>
          <Link className={styles.quickLink} href={talentsHref(locale, spec.slug)} prefetch={false} aria-label={`${copy.talents}: ${specName(spec, locale)}`} title={copy.talents}><Sparkles aria-hidden="true" /></Link>
          <Link className={styles.quickLink} href={boardHref(locale, spec.slug)} prefetch={false} aria-label={`${copy.leaderboard}: ${specName(spec, locale)}`} title={copy.leaderboard}><ListOrdered aria-hidden="true" /></Link>
        </span>
      </span>
    </li>
  );
}
