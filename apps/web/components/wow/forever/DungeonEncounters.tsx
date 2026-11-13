"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Skull } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { WOW_UI_TEXTURES } from "@/lib/games/wow/assets";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import { revealEncounter } from "./DungeonRoute";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { bossName } from "./encounterNames";
import { FOREVER_KIT } from "./foreverKit";
import { instanceName } from "./instanceLocalization";
import styles from "./dungeonGuide.module.css";

type Role = "tank" | "healer" | "dps";
type Mechanic = NonNullable<DungeonGuide["bosses"][number]["mechanics"]>[number] & { nameRu?: string; roles?: Role[] };
type Boss = DungeonGuide["bosses"][number] & { preparation?: Record<Lang, string>[]; nameRu?: string };
const ROLES: Role[] = ["tank", "healer", "dps"];
const audienceRole: Record<string, Role> = { Tank: "tank", Healer: "healer", Damage: "dps" };
const mechanicRoles = (mechanic: Mechanic): Role[] => mechanic.roles?.length ? mechanic.roles : audienceRole[mechanic.audience?.en ?? ""] ? [audienceRole[mechanic.audience!.en]] : [];
const bossRoles = (boss: Boss) => ROLES.filter(role => boss.mechanics?.some((mechanic: Mechanic) => mechanicRoles(mechanic).includes(role)));
const hasRoles = (bosses: Boss[]) => bosses.some(boss => bossRoles(boss).length);
const mechanicName = (mechanic: Mechanic, lang: Lang) => lang === "ru" ? mechanic.nameRu ?? instanceName(mechanic.name, lang) : mechanic.name;
const portraitFrame = materialIconFrameStyle(FOREVER_KIT, 56);
const spellFrame = materialIconFrameStyle(FOREVER_KIT, 36);

/** The bosses in the order of the run: portrait, name, the roles with a job in the fight; the card opens the abilities and what to do. */
export function DungeonEncounters({ bosses, lang }: { bosses: Boss[]; lang: Lang }) {
  const [role, setRole] = useState<Role | "all">("all");
  const t = dungeonGuideCopy[lang];
  const roleName: Record<Role, string> = { tank: t.tank, healer: t.healer, dps: t.dps };
  useEffect(() => {
    const reveal = () => revealEncounter(window.location.hash);
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <>
    {hasRoles(bosses) && <div id="encounter-role" className={styles.roleFilter}>
      <AtlasSegmented aria-label={t.role} value={role} onValueChange={value => setRole(value as Role | "all")}
        options={[{ value: "all", label: t.all }, ...ROLES.map(value => ({ value, label: roleName[value] }))]} />
    </div>}
    <ol className={styles.bosses}>
      {bosses.map((boss, index) => {
        const roles = bossRoles(boss);
        const open = Boolean(boss.mechanics?.length || boss.preparation?.length);
        const head = <>
          <span className={`${materialStyles.iconFrame} ${styles.portrait}`} style={portraitFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {boss.portrait ? <img src={boss.portrait} width={56} height={56} alt="" loading="lazy" /> : <Skull aria-hidden="true" />}
          </span>
          <span className={styles.bossHead}>
            <span className={styles.bossName}><span className={styles.bossOrder}>{index + 1}</span>{bossName(boss, lang)}</span>
            {!!boss.mechanics?.length && <span className={styles.bossAbilities}>{boss.mechanics.map((mechanic: Mechanic) => mechanicName(mechanic, lang)).join(" · ")}</span>}
          </span>
          {!!roles.length && <span className={styles.bossRoles}>{roles.map(value =>
            // eslint-disable-next-line @next/next/no-img-element
            <img key={value} src={WOW_UI_TEXTURES.roles[value]} width={22} height={22} alt={roleName[value]} title={roleName[value]} data-on={role === "all" || role === value ? "" : undefined} loading="lazy" />)}</span>}
        </>;
        return <li key={boss.name} id={`encounter-${index + 1}`} tabIndex={-1} className={styles.boss}>
          {open ? <details>
            <summary className={styles.bossSummary}>{head}<ChevronDown className={styles.chevron} aria-hidden="true" /></summary>
            <div className={styles.bossBody}>
              {!!boss.preparation?.length && <div className={styles.bossPreparation}><h4>{t.preparation}</h4>{boss.preparation.map(note => <p key={note.en}>{note[lang]}</p>)}</div>}
              {!!boss.mechanics?.length && <dl className={styles.mechanics}>{boss.mechanics.slice().sort((a, b) => Number(mechanicRoles(b).includes(role as Role)) - Number(mechanicRoles(a).includes(role as Role))).map((mechanic: Mechanic) => <div key={mechanic.name} data-match={mechanicRoles(mechanic).includes(role as Role) ? "" : undefined}>
                <dt className={styles.spell}>
                  {mechanic.icon && <span className={materialStyles.iconFrame} style={spellFrame}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mechanic.icon} width={36} height={36} alt="" loading="lazy" />
                  </span>}
                  <span>{mechanicName(mechanic, lang)}{mechanic.audience && <span className={styles.audience}>{mechanic.audience[lang]}</span>}</span>
                </dt>
                <dd>{mechanic.response[lang]}</dd>
              </div>)}</dl>}
            </div>
          </details> : <div className={styles.bossSummary}>{head}</div>}
        </li>;
      })}
    </ol>
  </>;
}
