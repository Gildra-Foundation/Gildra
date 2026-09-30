"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, GripVertical, Plus, RotateCcw, X } from "lucide-react";
import type { RotationAbility, RotationAplOptions, RotationAplRule } from "@/lib/platform/rotation/types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { AbilityIcon } from "./AbilityIcon";
import { AplConditionEditor, conditionSummary } from "./AplConditionEditor";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

export function PriorityEditor({ abilities, rules, aplRules, aplOptions, sourceLabel, defaults, lang, onChange, onAplChange, onReset, interactionsDisabled = false }: {
  abilities: RotationAbility[];
  rules: string[];
  aplRules: RotationAplRule[];
  aplOptions: RotationAplOptions;
  sourceLabel: string;
  defaults: string[];
  lang: Lang;
  onChange: (rules: string[]) => void;
  onAplChange: (rules: RotationAplRule[]) => void;
  onReset: () => void;
  interactionsDisabled?: boolean;
}) {
  const tr = t(lang);
  const [dragging, setDragging] = useState<string | null>(null);
  const [abilityToAdd, setAbilityToAdd] = useState("");
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const byId = new Map(abilities.map((ability) => [ability.id, ability]));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const drop = (target: string) => {
    if (!dragging || dragging === target) return setDragging(null);
    move(rules.indexOf(dragging), rules.indexOf(target));
    setDragging(null);
  };
  const missing = abilities.filter((ability) => ability.id !== "bloodlust" && !rules.includes(ability.id));
  const selectedMissing = missing.find((ability) => ability.id === abilityToAdd) ?? missing[0];

  return (
    <aside className={styles.priorityPanel} aria-labelledby="priority-rules-title">
      <header className={styles.panelHeader}>
        <div><h2 id="priority-rules-title">{tr("Priority Rules")}</h2><small>{sourceLabel} · {tr("Drag to reorder")}</small></div>
        <button className={deferredLabStyles.iconButton} onClick={onReset} disabled={interactionsDisabled} aria-label={tr("Reset priority rules")} title={tr("Reset priority rules")}><RotateCcw /></button>
      </header>
      <ol className={styles.ruleList}>
        {rules.map((id, index) => {
          const ability = byId.get(id);
          const aplRule = aplRules.find((rule) => rule.abilityId === id);
          if (!ability) return null;
          return (
            <li
              key={id}
              draggable={!interactionsDisabled}
              onDragStart={() => setDragging(id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(id)}
              className={dragging === id ? deferredLabStyles.dragging : ""}
            >
              <GripVertical aria-hidden="true" />
              <AbilityIcon ability={ability} size="sm" />
              <span><b>{ability.name}</b><small>{aplRule?.conditions.length ? aplRule.conditions.map((condition) => conditionSummary(condition, lang, byId, aplOptions.labels)).join(" · ") : (lang === "ru" ? "Всегда, когда способность доступна" : "Whenever the ability is usable")}</small><button type="button" className={styles.conditionToggle} aria-expanded={editingRule === id} onClick={() => setEditingRule((current) => current === id ? null : id)}>{lang === "ru" ? "Настроить условия" : "Edit conditions"}</button></span>
              <span className={deferredLabStyles.ruleMove}>
                <button onClick={() => move(index, index - 1)} disabled={interactionsDisabled || index === 0} aria-label={`${tr("Move up")}: ${ability.name}`}><ChevronUp /></button>
                <button onClick={() => move(index, index + 1)} disabled={interactionsDisabled || index === rules.length - 1} aria-label={`${tr("Move down")}: ${ability.name}`}><ChevronDown /></button>
                <button onClick={() => onChange(rules.filter((rule) => rule !== id))} disabled={interactionsDisabled || rules.length <= 1} aria-label={`${lang === "ru" ? "Удалить из панели" : "Remove from panel"}: ${ability.name}`}><X /></button>
              </span>
              {editingRule === id && aplRule && <AplConditionEditor rule={aplRule} options={aplOptions} abilities={abilities} lang={lang} disabled={interactionsDisabled} onChange={(next) => onAplChange(aplRules.map((item) => item.id === next.id ? next : item))} />}
            </li>
          );
        })}
      </ol>
      {missing.length ? (
        <div className={styles.priorityAdd}><select aria-label={lang === "ru" ? "Способность для добавления" : "Ability to add"} value={selectedMissing?.id ?? ""} disabled={interactionsDisabled || rules.length >= 10} onChange={(event) => setAbilityToAdd(event.target.value)}>{missing.map((ability) => <option key={ability.id} value={ability.id}>{ability.name}</option>)}</select><button className={styles.addRule} disabled={interactionsDisabled || rules.length >= 10 || !selectedMissing} onClick={() => selectedMissing && onChange([...rules, selectedMissing.id])}><Plus /> {tr("Add Rule")}</button></div>
      ) : (
        <div className={deferredLabStyles.rulesStatus} role="status"><CheckCircle2 /> {tr("All priority rules are active")}</div>
      )}
    </aside>
  );
}
