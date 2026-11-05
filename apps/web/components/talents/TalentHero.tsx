import type { ReactNode } from "react";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { trail, trailLabel } from "@/lib/routes/registry";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentCalculatorCopy, type TalentCopyLang } from "./talentCalculatorCopy";
import styles from "./talentAtlasPage.module.css";

type Props = {
  theme: TalentSpecTheme;
  lang: TalentCopyLang;
  /** One or two painted buttons under the lede. */
  actions?: ReactNode;
  /** A return link above the crumbs (the Rotation Lab hand-off). */
  back?: ReactNode;
};

/**
 * Hero of a talent page on the reference anatomy (docs/design/reference): crumbs, Alegreya title
 * and painted buttons. No eyebrow (the crumbs already name the section), lede, counters or source
 * line: the trees below speak for themselves. The scene sits behind it (TalentBackdrop).
 */
export function TalentHero({ theme, lang, actions, back }: Props) {
  const copy = talentCalculatorCopy[lang];
  const title = copy.title(theme);
  return <div className={styles.hero} data-talent-hero>
    {back}
    <AtlasHero align="start" className={styles.heroHeader}
      breadcrumbs={trail(lang, "characters", { label: title })} breadcrumbsLabel={trailLabel(lang)}
      title={title} actions={actions} />
  </div>;
}
