import { ResilientImage } from "@/components/media/ResilientImage";
import type { PullMechanic } from "./mdtPullIntel";
import { mechanicEffect, mechanicKind, toolsForMechanic, type PlayerSpec } from "./playerTools";
import { playerToolsCopy } from "./playerToolsCopy";
import type { TalentSpellSelection } from "./mythicTalentImport";
import styles from "./mdtPullDetails.module.css";

export function PlayerSpellAdvice({ spec, mechanic, locale, selectedSpells, compact = false }: { spec: PlayerSpec; mechanic: PullMechanic; locale: "ru" | "en"; selectedSpells?: TalentSpellSelection; compact?: boolean }) {
  const kind = mechanicKind(mechanic);
  if (!kind) return null;
  const t = playerToolsCopy[locale];
  const effect = mechanicEffect(mechanic);
  const options = toolsForMechanic(spec, mechanic, selectedSpells);
  const missing = selectedSpells ? t.notInBuild : kind === "interrupt" ? t.noInterrupt : kind === "stop" ? t.noStop : !effect ? t.noEffect : t.noDispel;
  return <div className={`${styles.playerAdvice} ${compact ? styles.compactAdvice : ""}`} data-testid="player-spell-advice" data-action={kind} data-effect={effect}>
    <b>{kind === "defend" ? t.personal : t.tools}{effect && (kind === "dispel" || kind === "purge") ? ` · ${t.effects[effect]}` : ""}</b>
    {options.length ? <ul>{options.map(option => <li key={option.spell.id} data-player-spell={option.spell.id}>
      <a className={styles.playerSpell} href={option.spell.source} target="_blank" rel="noreferrer"><ResilientImage src={option.spell.iconUrl} width={28} height={28} alt="" loading="lazy" /><span>{option.spell.name[locale]} ↗</span></a>
      {option.talents.map(talent => <small key={talent.id}>{selectedSpells ? t.selectedTalent : t.talent}: {talent.name[locale]}</small>)}
      {option.note && <small>{option.note[locale]}</small>}
    </li>)}</ul> : <p data-testid="player-spell-unavailable">{missing}</p>}
  </div>;
}
