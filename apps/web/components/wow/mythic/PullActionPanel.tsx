import { Ban, Shield, Crosshair, Footprints, Sparkles, Hand } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { ResilientImage } from "@/components/media/ResilientImage";
import type { PullIntel, PullMechanic } from "./mdtPullIntel";
import type { PlayerSpec } from "./playerTools";
import type { TalentSpellSelection } from "./mythicTalentImport";
import { pullRoleTasks, type PullRoleSelection } from "./pullRole";
import { PlayerSpellAdvice } from "./PlayerSpellAdvice";
import { MdtPullDetails } from "./MdtPullDetails";
import { pullWorkspaceCopy } from "./pullWorkspaceCopy";
import styles from "./mdtPullMap.module.css";

const icons = { "Кик": Ban, "Стоп": Hand, "Диспел": Sparkles, "Пурж": Sparkles, "Фокус": Crosshair, "Уклонение": Footprints, "Защита": Shield };
const actionOrder: PullMechanic["action"][] = ["Кик", "Стоп", "Диспел", "Пурж", "Фокус", "Уклонение", "Защита"];

type Props = { title: string; intel: PullIntel; locale: "ru" | "en"; role: PullRoleSelection; spec?: PlayerSpec; spells?: TalentSpellSelection };
export function PullActionPanel({ title, intel, locale, role, spec, spells }: Props) {
  const t = pullWorkspaceCopy[locale];
  const personal = role === "all" ? null : pullRoleTasks(intel, role, spec, spells);
  const mechanics = personal?.mechanics ?? intel.mechanics;
  const notes = personal?.notes ?? [...new Set(intel.enemies.flatMap(enemy => enemy.note ? [enemy.note] : []))];
  return <>
    <section className={styles.composition} aria-label={t.composition}>
      <h5>{t.composition}</h5>
      <ul>{intel.enemies.map(enemy => <li key={enemy.npcId ?? enemy.name}>
        <ResilientImage src={enemy.portraitUrl} width={40} height={40} alt="" loading="lazy" fallback={<span className={styles.portraitFallback} aria-hidden="true">{enemy.name.slice(0, 1)}</span>} />
        <span>{enemy.name}</span><b>×{enemy.count}</b>
      </li>)}</ul>
    </section>
    <section className={styles.actions} data-testid="pull-selected-actions" data-role={role} aria-label={role === "all" ? t.actions : t.yourActions}>
      <div className={styles.actionHeading}><h5>{role === "all" ? t.actions : t.yourActions}</h5><span>{spec ? spec.name[locale] : t[role]}</span></div>
      {actionOrder.map(action => {
        const rows = mechanics.filter(ability => ability.action === action);
        const Icon = icons[action];
        return rows.length > 0 && <section className={styles.actionGroup} key={action} data-action-group={action}>
          <h6><Icon size={18} aria-hidden="true" />{t.action[action]}</h6>
          <ul>{rows.map(ability => <li key={`${ability.npcId ?? ability.source}:${ability.spellId ?? ability.name}`}>
            <div className={styles.castIdentity}><ResilientImage src={ability.iconUrl} width={32} height={32} alt="" loading="lazy" /><div><b>{ability.name}</b><small>{ability.source}{role === "all" ? ` · ${t[ability.role]}` : ""}</small></div></div>
            {ability.response && <p>{ability.response}</p>}
            {spec && <PlayerSpellAdvice compact spec={spec} mechanic={ability} locale={locale} selectedSpells={spells} />}
          </li>)}</ul>
        </section>;
      })}
      {!mechanics.length && !notes.length && <p className={styles.emptyActions}>{intel.checkedAt ? t.noActions : t.missing}</p>}
      {notes.length > 0 && <ul className={styles.eventNotes}>{notes.map(note => <li key={note}>{note}</li>)}</ul>}
    </section>
    <MdtPullDetails title={title} intel={intel} locale={locale} selectedRole={role} selectedSpec={spec} selectedSpells={spells}><AtlasButton className={styles.briefingButton} variant="ghost">{t.details} ↗</AtlasButton></MdtPullDetails>
  </>;
}
