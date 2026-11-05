import type { ReactNode } from "react";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { AtlasStats, type AtlasStat } from "@gildra/atlas-ui/AtlasStats";
import { trail, trailLabel } from "@/lib/routes/registry";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentCalculatorCopy, talentThemeNames, type TalentCopyLang } from "./talentCalculatorCopy";
import styles from "./talentAtlasPage.module.css";

type Props = {
  theme: TalentSpecTheme;
  lang: TalentCopyLang;
  /** One or two painted buttons under the lede. */
  actions?: ReactNode;
  /** Counters from the loaded trees (never invented). */
  stats?: AtlasStat[];
  /** One quiet source line (data provider ↗ and snapshot date). */
  source?: ReactNode;
  /** A return link above the crumbs (the Rotation Lab hand-off). */
  back?: ReactNode;
};

/**
 * Hero of a talent page on the reference anatomy (docs/design/reference): crumbs, eyebrow,
 * Alegreya title, lede, painted buttons, counters. The scene sits behind it (TalentBackdrop).
 */
export function TalentHero({ theme, lang, actions, stats, source, back }: Props) {
  const copy = talentCalculatorCopy[lang];
  const names = talentThemeNames(theme, lang);
  const title = copy.title(theme);
  return <div className={styles.hero} data-talent-hero>
    {back}
    <AtlasHero align="start" className={styles.heroHeader}
      breadcrumbs={trail(lang, "characters", { label: title })} breadcrumbsLabel={trailLabel(lang)}
      eyebrow={copy.heroEyebrow(names.className, names.role)} title={title} lede={copy.heroLede} actions={actions} />
    {stats?.length ? <div className={styles.facts}><AtlasStats label={copy.heroStatsLabel} items={stats} /></div> : null}
    {source ? <p className={styles.source}>{source}</p> : null}
  </div>;
}
