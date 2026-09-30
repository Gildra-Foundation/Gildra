"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationAbility } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import { actionBindingLabel, bindingFromKeyboardEvent, bindingFromMouseEvent, bindingFromWheelEvent, isRiskyActionBinding, normalizeActionBinding } from "./actionBarBindings";
import { ACTION_BAR_SLOT_COUNT, type TrainerSlot } from "./actionBarLayout";
import styles from "./rotationLab.module.css";

export function TrainerBarConfig({ open, lang, abilities, slots, storageLabel, onClose, onUpdateSlot, onMoveSlot, onRemoveSlot, onAddSlot, onReset }: {
  open: boolean;
  lang: Lang;
  abilities: RotationAbility[];
  slots: TrainerSlot[];
  storageLabel: string;
  onClose: () => void;
  onUpdateSlot: (index: number, patch: Partial<TrainerSlot>) => void;
  onMoveSlot: (index: number, direction: -1 | 1) => void;
  onRemoveSlot: (index: number) => void;
  onAddSlot: () => void;
  onReset: () => void;
}) {
  const tr = t(lang);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [capturingSlot, setCapturingSlot] = useState<number | null>(null);
  const [bindingNotice, setBindingNotice] = useState("");
  const capturedMouseSlot = useRef<number | null>(null);
  const byId = new Map(abilities.map((ability) => [ability.id, ability]));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => closeRef.current?.focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const applyBinding = (binding: string, index: number) => {
    const normalized = normalizeActionBinding(binding);
    if (normalized === null) return;
    const existing = slots.find((slot, slotIndex) => slotIndex !== index && slot.key === normalized);
    onUpdateSlot(index, { key: normalized });
    setBindingNotice(existing ? (lang === "ru" ? "Назначение перенесено: прежняя ячейка теперь без клавиши." : "Binding moved: the previous slot is now unbound.") : isRiskyActionBinding(normalized) ? tr("This key may be reserved by your browser.") : tr("Key saved."));
    setCapturingSlot(null);
  };
  useEffect(() => {
    if (!open || capturingSlot === null) return;
    const button = dialogRef.current?.querySelector<HTMLButtonElement>(`[data-binding-capture-index="${capturingSlot}"]`);
    if (!button) return;
    const captureWheel = (event: WheelEvent) => {
      if (document.activeElement !== button) return;
      const binding = bindingFromWheelEvent(event);
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      applyBinding(binding, capturingSlot);
    };
    button.addEventListener("wheel", captureWheel, { passive: false });
    return () => button.removeEventListener("wheel", captureWheel);
  }, [open, capturingSlot, slots, onUpdateSlot, lang]);
  const captureBinding = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (capturingSlot !== index || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return setCapturingSlot(null);
    const binding = bindingFromKeyboardEvent(event.nativeEvent);
    if (binding) applyBinding(binding, index);
  };
  const captureMouseBinding = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    if (capturingSlot !== index) return;
    const binding = bindingFromMouseEvent(event.nativeEvent);
    if (!binding) return;
    event.preventDefault();
    event.stopPropagation();
    capturedMouseSlot.current = index;
    applyBinding(binding, index);
  };
  const restoreDefaults = () => {
    onReset();
    setCapturingSlot(null);
    setBindingNotice(lang === "ru" ? "Панель восстановлена: стандартные способности и назначения клавиш." : "Bar restored: default abilities and key bindings.");
  };

  return (
    <dialog ref={dialogRef} className={styles.trainerConfigDialog} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} aria-labelledby="trainer-config-title">
      <div className={styles.trainerConfig} data-binding-editor>
        <header className={styles.trainerConfigTitle}>
          <div><strong id="trainer-config-title">{tr("Action Bar Setup")}</strong><small>{tr("Choose abilities and assign your real in-game keys.")} {lang === "ru" ? "Нажмите поле клавиши, затем клавишу, кнопку мыши или колёсико. Сочетания с Ctrl, Alt и Shift поддерживаются; Esc отменяет запись." : "Click a binding, then press a key, mouse button or wheel. Ctrl, Alt and Shift combinations work; Esc cancels recording."}</small></div>
          <div><button onClick={restoreDefaults}><RotateCcw /> {lang === "ru" ? "Стандартная раскладка" : "Default layout"}</button><button ref={closeRef} className={styles.trainerConfigClose} onClick={onClose} aria-label={tr("Close action bar setup")}><X /></button></div>
        </header>
        <ol>
          {slots.map((slot, index) => {
            const ability = byId.get(slot.abilityId) ?? abilities[0];
            return (
              <li key={`${slot.abilityId}-${index}`}>
                <b>{slot.position + 1}</b>
                <AbilityIcon ability={ability} size="sm" />
                <label><span>{tr("Ability")}</span><select value={slot.abilityId} onChange={(event) => onUpdateSlot(index, { abilityId: event.target.value })}>{abilities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <button type="button" data-binding-capture-index={index} className={`${styles.trainerKeyInput} ${capturingSlot === index ? styles.trainerKeyCapturing : ""}`} aria-label={`${tr("Bind key")}: ${ability.name}`} aria-pressed={capturingSlot === index} onClick={() => { capturedMouseSlot.current = null; setCapturingSlot(index); setBindingNotice(""); }} onKeyDown={(event) => captureBinding(event, index)} onMouseDown={(event) => captureMouseBinding(event, index)} onContextMenu={(event) => { if (capturingSlot === index || capturedMouseSlot.current === index) event.preventDefault(); }} onAuxClick={(event) => { if (capturingSlot === index || capturedMouseSlot.current === index) event.preventDefault(); }} onBlur={() => { setCapturingSlot(null); capturedMouseSlot.current = null; }}><span>{capturingSlot === index ? tr("Press any key") : tr("Key")}</span><kbd title={slot.key}>{actionBindingLabel(slot.key)}</kbd></button>
                <button className={styles.trainerClearKey} disabled={!slot.key} aria-label={`${tr("Clear key")}: ${ability.name}`} onClick={() => onUpdateSlot(index, { key: "" })}><X /></button>
                <div className={styles.trainerSlotActions}>
                  <button disabled={index === 0} aria-label={`${tr("Move up")}: ${ability.name}`} onClick={() => onMoveSlot(index, -1)}><ChevronUp /></button>
                  <button disabled={index === slots.length - 1} aria-label={`${tr("Move down")}: ${ability.name}`} onClick={() => onMoveSlot(index, 1)}><ChevronDown /></button>
                  <button disabled={slots.length <= 4} aria-label={`${tr("Remove")}: ${ability.name}`} onClick={() => onRemoveSlot(index)}><Trash2 /></button>
                </div>
              </li>
            );
          })}
        </ol>
        <footer className={styles.trainerConfigFooter}>
          <button className={styles.trainerAddSlot} disabled={slots.length >= ACTION_BAR_SLOT_COUNT || slots.length >= abilities.length} onClick={onAddSlot}><Plus /> {tr("Add Skill Slot")}</button>
          <button className={styles.trainerResetLayoutMobile} onClick={restoreDefaults}><RotateCcw /> {lang === "ru" ? "Сбросить раскладку" : "Default layout"}</button>
          <span role="status" aria-live="polite">{bindingNotice || storageLabel}</span>
          <button className={styles.trainerConfigDone} onClick={onClose}>{tr("Done")}</button>
        </footer>
      </div>
    </dialog>
  );
}
