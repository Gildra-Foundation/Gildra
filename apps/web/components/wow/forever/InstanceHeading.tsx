import type { ReactNode } from "react";
import { AtlasHero, AtlasStats } from "@/components/atlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { hallGuideCopy } from "./hallGuideCopy";
import type { ForeverDungeon } from "./instanceData";
import { dungeonFacts } from "./instanceFacts";
import styles from "./dungeonGuide.module.css";

/** Heading of a dungeon page: where it is, its name and one row of facts (level band, bosses, group size). */
export function InstanceHeading({ lang, dungeon, lede, players }: { lang: Lang; dungeon: ForeverDungeon; lede?: ReactNode; players?: number }) {
  const t = hallGuideCopy[lang];
  const facts = dungeonFacts(dungeon, lang);
  return <AtlasHero align="start" className={styles.heading} title={facts.name} eyebrow={facts.location || undefined}
    lede={lede ?? (facts.alias ? <span lang="en">{facts.alias}</span> : undefined)}
    breadcrumbsLabel={t.breadcrumb} breadcrumbs={[{ label: "Forever", href: p(lang, "/wow/forever") }, { label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: facts.name }]}
    actions={<AtlasStats className={styles.headingFacts} items={[
      { value: `${dungeon.min}–${dungeon.max}`, label: t.level },
      { value: String(facts.bosses), label: t.encounters },
      ...(players ? [{ value: String(players), label: t.players }] : []),
    ]} />} />;
}
