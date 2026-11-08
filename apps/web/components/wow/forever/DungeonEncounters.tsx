"use client";
import { useEffect } from "react";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import { revealEncounter } from "./DungeonRoute";
import styles from "./dungeonGuide.module.css";

export function DungeonEncounters({ bosses, lang }: { bosses: DungeonGuide["bosses"]; lang: Lang }) {
  useEffect(() => {
    const reveal = () => revealEncounter(window.location.hash);
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <div className={styles.bosses}>{bosses.map((boss, index) => <MaterialPlaque key={boss.name} kit="den-of-nalorakk" as="article">
          <div id={`encounter-${index + 1}`} tabIndex={-1} className={styles.encounter}>
          {boss.mechanics?.length ? <AtlasDisclosure summary={<span className={styles.bossSummary}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {boss.portrait && <img className={styles.portrait} src={boss.portrait} width={56} height={56} alt="" loading="lazy" />}<span>{boss.name}</span>
          </span>}>
            <dl className={styles.mechanics}>{boss.mechanics.map(mechanic => <div key={mechanic.name}><dt className={styles.spell}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {mechanic.icon && <img src={mechanic.icon} width={28} height={28} alt="" loading="lazy" />}{mechanic.name}
            </dt><dd>{mechanic.audience && <span className={styles.audience}>{mechanic.audience[lang]}: </span>}{mechanic.response[lang]}</dd></div>)}</dl>
          </AtlasDisclosure> : <h3 className={materialStyles.title}>{boss.name}</h3>}
        </div></MaterialPlaque>)}</div>;
}
