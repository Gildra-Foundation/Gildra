import Image from "next/image";
import Link from "next/link";
import { ListOrdered, Repeat, Sparkles } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT, TALENTS_KIT } from "@/lib/wow/charactersKit";
import { getMidnightClassSpecs } from "@/lib/data/wow";
import { armorWords, classArmor, heroTreeLines, specResource } from "@/lib/data/wow/classFacts";
import { loadSpecBoards, loadSpecTiers } from "@/lib/games/wow/classMeta";
import { routeSections, sectionHref, trail } from "@/lib/routes/registry";
import { classCopy } from "./classCopy";
import {
  HeroShares, RoleBadge, TierChip, boardHref, classColorStyle, formatShare, mythicTier, rotationHref, specHref, specName, talentsHref,
  type Locale,
} from "./ClassParts";
import styles from "./classCatalog.module.css";

/** /wow/classes/<class>: its specializations (role, resource, tier, hero trees of top players) and its hero talent trees. */
export async function ClassPage({ locale, classSlug }: { locale: Locale; classSlug: string }) {
  const copy = classCopy[locale];
  const specs = getMidnightClassSpecs(classSlug);
  const first = specs[0];
  const name = locale === "ru" ? first.classNameRu : first.className;
  const [tiers, boards] = await Promise.all([loadSpecTiers(), loadSpecBoards(specs)]);
  const heroTrees = [...new Map(specs.flatMap((spec) => spec.heroPaths.map((path) => [path.id, path] as const))).values()];

  return (
    <AtlasFrame lang={locale} scene="classes">
      <div style={classColorStyle(first.classKey)}>
        <AtlasHero
          breadcrumbs={trail(locale, "classes", { label: name })}
          breadcrumbsLabel={copy.breadcrumbs}
          emblem={<span className={`${materialStyles.iconFrame} ${styles.classIcon}`} style={materialIconFrameStyle(KIT, 64)}><Image src={first.classIconUrl} alt="" width={64} height={64} priority /></span>}
          emblemShape="square"
          eyebrow={`${copy.armor}: ${armorWords[classArmor[first.classKey]][locale]}`}
          title={name}
          className={styles.classHero}
        />

        <AtlasSection id="specs" title={copy.specializations}>
          <ul className={styles.specGrid}>
            {specs.map((spec) => {
              const tier = mythicTier(tiers[spec.slug]);
              return (
                <MaterialPlaque as="li" kit={KIT} key={spec.slug} className={styles.specCard} aria-labelledby={`${spec.slug}-title`}>
                  <div className={styles.specCardHead}>
                    <Image src={spec.iconUrl} alt="" width={52} height={52} />
                    <div className={styles.specCardTitle}>
                      <h3 id={`${spec.slug}-title`}><Link href={specHref(locale, spec)}>{specName(spec, locale)}</Link></h3>
                      <RoleBadge role={spec.role} copy={copy} />
                    </div>
                    {tier ? <span className={styles.tierPair}><span aria-hidden="true">M+</span><TierChip tier={tier.tier} label={copy.tierAria(tier.tier)} size="large" /></span> : null}
                  </div>
                  <dl className={styles.facts}>
                    <dt>{copy.resource}</dt><dd>{specResource[spec.slug]?.[locale]}</dd>
                    <dt>{copy.heroTrees}</dt><dd><HeroShares board={boards[spec.slug]} spec={spec} locale={locale} copy={copy} /></dd>
                  </dl>
                  <ul className={styles.linkRow}>
                    <li><Link className={styles.textLink} href={talentsHref(locale, spec.slug)} prefetch={false}><Sparkles aria-hidden="true" />{copy.talents}</Link></li>
                    <li><Link className={styles.textLink} href={rotationHref(locale, spec.slug)} prefetch={false}><Repeat aria-hidden="true" />{copy.rotation}</Link></li>
                    <li><Link className={styles.textLink} href={boardHref(locale, spec.slug)} prefetch={false}><ListOrdered aria-hidden="true" />{copy.leaderboard}</Link></li>
                  </ul>
                </MaterialPlaque>
              );
            })}
          </ul>
        </AtlasSection>

        <AtlasSection id="hero-trees" title={copy.heroTrees}>
          <ul className={styles.heroGrid}>
            {heroTrees.map((hero) => {
              const users = specs.filter((spec) => spec.heroPaths.some((path) => path.id === hero.id));
              return (
                <MaterialPlaque as="li" kit={TALENTS_KIT} key={hero.id} className={styles.heroCard} aria-labelledby={`hero-${hero.id}`}>
                  <h3 id={`hero-${hero.id}`}>{locale === "ru" ? hero.nameRu : hero.name}</h3>
                  {heroTreeLines[hero.id] ? <p>{heroTreeLines[hero.id][locale]}</p> : null}
                  <ul className={styles.heroSpecs} aria-label={copy.usedBy}>
                    {users.map((spec) => {
                      const board = boards[spec.slug];
                      const share = board ? board.heroes.find((item) => item.id === hero.id)?.share ?? 0 : undefined;
                      return (
                        <li key={spec.slug}>
                          <Link href={`${talentsHref(locale, spec.slug)}?hero=${hero.id}`} prefetch={false}>
                            <Image src={spec.iconUrl} alt="" width={20} height={20} />
                            {specName(spec, locale)}
                            {share !== undefined ? <b>{formatShare(share, copy)}</b> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </MaterialPlaque>
              );
            })}
          </ul>
        </AtlasSection>

        <p className={styles.back}><Link className={styles.textLink} href={sectionHref("classes", locale)}>{routeSections.classes.title[locale]}</Link></p>
      </div>
    </AtlasFrame>
  );
}
