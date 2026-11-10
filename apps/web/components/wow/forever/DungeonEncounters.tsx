"use client";
import { useEffect, useState } from "react";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { AtlasField, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import { revealEncounter } from "./DungeonRoute";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { instanceName } from "./instanceLocalization";
import styles from "./dungeonGuide.module.css";
import ux from "./foreverUx.module.css";
type Mechanic = NonNullable<DungeonGuide["bosses"][number]["mechanics"]>[number] & { nameRu?: string; roles?: ("tank" | "healer" | "dps")[] };
const roleMatch = (mechanic: Mechanic, role: string) => Boolean(role) && (mechanic.roles?.includes(({ Tank: "tank", Healer: "healer", Damage: "dps" } as const)[role as "Tank" | "Healer" | "Damage"]) || mechanic.audience?.en === role);
type Boss = DungeonGuide["bosses"][number] & { preparation?: Record<Lang, string>[]; nameRu?: string };
const hasRoles = (bosses: Boss[]) => bosses.some(boss => boss.mechanics?.some((mechanic: Mechanic) => mechanic.roles?.length || ["Tank", "Healer", "Damage"].includes(mechanic.audience?.en ?? "")));
const bossName = (boss: Boss, lang: Lang) => lang === "ru" ? boss.nameRu ?? instanceName(boss.name, lang) : boss.name;
export function EncounterNavigation({ bosses, lang }: { bosses: Boss[]; lang: Lang }) {
  return <nav className={ux.jump} aria-label={dungeonGuideCopy[lang].encounters}><AtlasDisclosure summary={dungeonGuideCopy[lang].encounters}>
    <ul className={ux.links}>{bosses.map((boss, index) => <li key={boss.name}><a href={`#encounter-${index + 1}`} onClick={() => revealEncounter(`#encounter-${index + 1}`, true)}>{bossName(boss, lang)}</a></li>)}</ul>
  </AtlasDisclosure>{hasRoles(bosses) && <ul className={ux.links}><li><a href="#encounter-role">{dungeonGuideCopy[lang].role}</a></li></ul>}</nav>;
}
export function DungeonEncounters({ bosses, lang }: { bosses: Boss[]; lang: Lang }) {
  const [role, setRole] = useState("");
  const t = dungeonGuideCopy[lang];
  useEffect(() => {
    const reveal = () => revealEncounter(window.location.hash);
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <div className={styles.bosses}>
    {hasRoles(bosses) && <AtlasField className={ux.anchor} label={t.role} htmlFor="encounter-role"><AtlasSelect id="encounter-role" value={role} onChange={e => setRole(e.target.value)}>
      <option value="">{t.all}</option><option value="Tank">{t.tank}</option><option value="Healer">{t.healer}</option><option value="Damage">{t.dps}</option>
    </AtlasSelect></AtlasField>}
    {bosses.map((boss, index) => <MaterialPlaque key={boss.name} kit="den-of-nalorakk" as="article">
      <div id={`encounter-${index + 1}`} tabIndex={-1} className={styles.encounter}>
        {boss.mechanics?.length || boss.preparation?.length ? <AtlasDisclosure summary={<span className={styles.bossSummary}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {boss.portrait && <img className={styles.portrait} src={boss.portrait} width={56} height={56} alt="" loading="lazy" />}<span>{bossName(boss, lang)}</span>
        </span>}>
          {!!boss.preparation?.length && <div className={ux.preparation}><h4>{t.preparation}</h4>{boss.preparation.map(note => <p key={note.en}>{note[lang]}</p>)}</div>}
          <dl className={styles.mechanics}>{boss.mechanics?.slice().sort((a, b) => Number(roleMatch(b, role)) - Number(roleMatch(a, role))).map((mechanic: Mechanic) => <div key={mechanic.name} className={roleMatch(mechanic, role) ? ux.roleMatch : undefined}><dt className={styles.spell}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {mechanic.icon && <img src={mechanic.icon} width={28} height={28} alt="" loading="lazy" />}{lang === "ru" ? mechanic.nameRu ?? instanceName(mechanic.name, lang) : mechanic.name}
          </dt><dd>{mechanic.audience && <span className={styles.audience}>{mechanic.audience[lang]}: </span>}{mechanic.response[lang]}</dd></div>)}</dl>
        </AtlasDisclosure> : <h3 className={materialStyles.title}>{bossName(boss, lang)}</h3>}
      </div></MaterialPlaque>)}
  </div>;
}
