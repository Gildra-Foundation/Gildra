import type { ReactNode } from "react";
import Image from "next/image";
import { AtlasStats } from "@/components/atlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverHero, ForeverPanel } from "./shared";
import { hallGuideCopy } from "./hallGuideCopy";
import { instanceArt } from "./instanceArt";
import type { ForeverDungeon } from "./instanceData";
import { dungeonFacts } from "./instanceFacts";
import styles from "./dungeonGuide.module.css";

/** Heading of a dungeon page: where it is, its name, one row of facts (level band, bosses, group size) and the dungeon's painting. */
export function InstanceHeading({ lang, dungeon, lede, players }: { lang: Lang; dungeon: ForeverDungeon; lede?: ReactNode; players?: number }) {
  const t = hallGuideCopy[lang];
  const facts = dungeonFacts(dungeon, lang);
  const painting = instanceArt(dungeon.slug);
  return <ForeverHero lang={lang} className={styles.heading} title={facts.name} eyebrow={facts.location || undefined}
    lede={lede ?? (facts.alias ? <span lang="en">{facts.alias}</span> : undefined)}
    trail={[{ label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: facts.name }]}
    actions={<AtlasStats className={styles.headingFacts} items={[
      { value: `${dungeon.min}–${dungeon.max}`, label: t.level },
      { value: String(facts.bosses), label: t.encounters },
      ...(players ? [{ value: String(players), label: t.players }] : []),
    ]} />}
    aside={painting && <ForeverPanel className={styles.headingArt} aria-hidden="true">
      <div><Image src={painting.src} alt="" fill priority sizes="(max-width: 1100px) 100vw, 460px" style={{ objectPosition: painting.position }} /></div>
    </ForeverPanel>} />;
}
