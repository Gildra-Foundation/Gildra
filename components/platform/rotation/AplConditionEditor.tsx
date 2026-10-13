"use client";

import { Plus, Trash2 } from "lucide-react";
import type { RotationAplCondition, RotationAplOptions, RotationAplRule, RotationAbility } from "@/lib/platform/rotation/types";
import type { Lang } from "@/lib/i18n";
import { rotationLabelKey, rotationResourceLabel } from "@/lib/platform/rotation/locale";
import styles from "./rotationLab.module.css";
import { aplConditionEditorCopy } from "./aplConditionEditorCopy";

type ConditionType = RotationAplCondition["type"];

function newCondition(type: ConditionType, options: RotationAplOptions): RotationAplCondition | null {
  if (type === "resource") return options.resources[0] ? { type, resource: options.resources[0], operator: "gte", value: 50 } : null;
  if (type === "buff") return options.buffs[0] ? { type, aura: options.buffs[0], state: "up" } : null;
  if (type === "cooldown") return options.cooldowns[0] ? { type, abilityId: options.cooldowns[0], state: "ready" } : null;
  if (type === "targets") return { type, operator: "gte", value: 3 };
  return { type: "execute", operator: "lte", value: 20 };
}

export function conditionSummary(condition: RotationAplCondition, lang: Lang, abilities: Map<string, RotationAbility>, labels: Record<string, string> = {}) {
  if (condition.type === "resource") return `${rotationResourceLabel(condition.resource, lang)}: ${condition.operator === "gte" ? "≥" : "≤"} ${condition.value}`;
  if (condition.type === "buff") return `${labels[rotationLabelKey(condition.aura)] ?? condition.aura}: ${condition.state === "up" ? aplConditionEditorCopy[lang].active : aplConditionEditorCopy[lang].inactive}`;
  if (condition.type === "cooldown") return `${abilities.get(condition.abilityId)?.name ?? condition.abilityId}: ${condition.state === "ready" ? aplConditionEditorCopy[lang].ready : aplConditionEditorCopy[lang].onCooldown}`;
  if (condition.type === "targets") return `${aplConditionEditorCopy[lang].targets} ${condition.operator === "gte" ? "≥" : "≤"} ${condition.value}`;
  return `${aplConditionEditorCopy[lang].targetHealth} ≤ ${condition.value}%`;
}

export function AplConditionEditor({ rule, options, abilities, lang, disabled, onChange }: {
  rule: RotationAplRule;
  options: RotationAplOptions;
  abilities: RotationAbility[];
  lang: Lang;
  disabled?: boolean;
  onChange: (rule: RotationAplRule) => void;
}) {
  const abilityMap = new Map(abilities.map((ability) => [ability.id, ability]));
  const update = (index: number, condition: RotationAplCondition) => onChange({ ...rule, conditions: rule.conditions.map((item, itemIndex) => itemIndex === index ? condition : item), source: "custom" });
  const availableTypes: Array<{ value: ConditionType; label: string; enabled: boolean }> = [
    { value: "resource", label: aplConditionEditorCopy[lang].resource, enabled: options.resources.length > 0 },
    { value: "buff", label: aplConditionEditorCopy[lang].buff, enabled: options.buffs.length > 0 },
    { value: "cooldown", label: aplConditionEditorCopy[lang].cooldown, enabled: options.cooldowns.length > 0 },
    { value: "targets", label: aplConditionEditorCopy[lang].targetCount, enabled: true },
    { value: "execute", label: aplConditionEditorCopy[lang].execute, enabled: true },
  ];
  const firstType = availableTypes.find((type) => type.enabled)?.value ?? "targets";

  return <div className={styles.conditionEditor} aria-label={aplConditionEditorCopy[lang].castConditions}>
    {rule.conditions.map((condition, index) => <div className={styles.conditionRow} key={`${condition.type}-${index}`}>
      <span>{aplConditionEditorCopy[lang].when}</span>
      {condition.type === "resource" && <><select value={condition.resource} disabled={disabled} onChange={(event) => update(index, { ...condition, resource: event.target.value })}>{options.resources.map((resource) => <option key={resource} value={resource}>{rotationResourceLabel(resource, lang)}</option>)}</select><select value={condition.operator} disabled={disabled} onChange={(event) => update(index, { ...condition, operator: event.target.value as "gte" | "lte" })}><option value="gte">≥</option><option value="lte">≤</option></select><input type="number" min="0" max="1000" value={condition.value} disabled={disabled} aria-label={aplConditionEditorCopy[lang].resourceAmount} onChange={(event) => update(index, { ...condition, value: Math.min(1000, Math.max(0, Number(event.target.value))) })} /></>}
      {condition.type === "buff" && <><select value={condition.aura} disabled={disabled} onChange={(event) => update(index, { ...condition, aura: event.target.value })}>{options.buffs.map((buff) => <option key={buff} value={buff}>{options.labels?.[rotationLabelKey(buff)] ?? buff}</option>)}</select><select value={condition.state} disabled={disabled} onChange={(event) => update(index, { ...condition, state: event.target.value as "up" | "down" })}><option value="up">{aplConditionEditorCopy[lang].active}</option><option value="down">{aplConditionEditorCopy[lang].inactive}</option></select></>}
      {condition.type === "cooldown" && <><select value={condition.abilityId} disabled={disabled} onChange={(event) => update(index, { ...condition, abilityId: event.target.value })}>{options.cooldowns.map((id) => <option key={id} value={id}>{abilityMap.get(id)?.name ?? id}</option>)}</select><select value={condition.state} disabled={disabled} onChange={(event) => update(index, { ...condition, state: event.target.value as "ready" | "down" })}><option value="ready">{aplConditionEditorCopy[lang].ready}</option><option value="down">{aplConditionEditorCopy[lang].onCooldown}</option></select></>}
      {condition.type === "targets" && <><select value={condition.operator} disabled={disabled} onChange={(event) => update(index, { ...condition, operator: event.target.value as "gte" | "lte" })}><option value="gte">≥</option><option value="lte">≤</option></select><input type="number" min="1" max="8" value={condition.value} disabled={disabled} aria-label={aplConditionEditorCopy[lang].targetCount2} onChange={(event) => update(index, { ...condition, value: Math.min(8, Math.max(1, Number(event.target.value))) })} /></>}
      {condition.type === "execute" && <><span>{aplConditionEditorCopy[lang].targetHealth2}</span><input type="number" min="1" max="100" value={condition.value} disabled={disabled} aria-label={aplConditionEditorCopy[lang].targetHealthPercent} onChange={(event) => update(index, { ...condition, value: Math.min(100, Math.max(1, Number(event.target.value))) })} /><span>%</span></>}
      <button type="button" disabled={disabled} onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, itemIndex) => itemIndex !== index), source: "custom" })} aria-label={aplConditionEditorCopy[lang].removeCondition}><Trash2 /></button>
    </div>)}
    {rule.conditions.length < 3 && <div className={styles.conditionAdd}><select defaultValue={firstType} disabled={disabled} aria-label={aplConditionEditorCopy[lang].newConditionType} id={`condition-type-${rule.id}`}>{availableTypes.map((type) => <option key={type.value} value={type.value} disabled={!type.enabled}>{type.label}</option>)}</select><button type="button" disabled={disabled} onClick={() => { const select = document.getElementById(`condition-type-${rule.id}`) as HTMLSelectElement | null; const condition = newCondition((select?.value as ConditionType) ?? firstType, options); if (condition) onChange({ ...rule, conditions: [...rule.conditions, condition], source: "custom" }); }}><Plus /> {aplConditionEditorCopy[lang].addCondition}</button></div>}
  </div>;
}
