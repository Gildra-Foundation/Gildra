"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./auction.module.css";

export type ComboOption = { key: string; label: string; render?: ReactNode };

/**
 * A text field with a list of suggestions (ARIA 1.2 combobox): arrows move through the list, Enter picks,
 * Escape closes. With `onSubmitText`, Enter without a highlighted option submits the typed text.
 */
export function AuctionCombobox({ id, label, value, onText, options, onPick, onSubmitText, placeholder, empty, icon, busy, disabled, className, invalid, hideLabel }: {
  id: string; label: string; value: string; onText: (text: string) => void; options: readonly ComboOption[];
  onPick: (option: ComboOption) => void; onSubmitText?: (text: string) => void; placeholder?: string; empty?: string;
  icon?: ReactNode; busy?: boolean; disabled?: boolean; className?: string; invalid?: boolean; hideLabel?: boolean;
}) {
  const listId = useId(), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const shown = open && (options.length > 0 || Boolean(empty && value.trim().length >= 2 && !busy));
  const pick = (option: ComboOption) => { onPick(option); setOpen(false); setActive(-1); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      if (!options.length) return;
      setActive(current => event.key === "ArrowDown" ? (current + 1) % options.length : current <= 0 ? options.length - 1 : current - 1);
    } else if (event.key === "Enter") {
      if (shown && active >= 0 && options[active]) { event.preventDefault(); pick(options[active]); }
      else if (onSubmitText) { event.preventDefault(); setOpen(false); onSubmitText(value); }
    } else if (event.key === "Escape") {
      if (open) { event.preventDefault(); setOpen(false); setActive(-1); }
    }
  };
  return <div className={clsx(styles.combo, className)} data-invalid={invalid || undefined}>
    <label htmlFor={id} className={hideLabel ? styles.srOnly : styles.fieldLabel}>{label}</label>
    <div className={styles.comboField}>
      {icon ? <span className={styles.comboIcon} aria-hidden="true">{icon}</span> : null}
      <input id={id} className={styles.comboInput} role="combobox" type="text" autoComplete="off" spellCheck={false}
        aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-invalid={invalid || undefined}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={value} placeholder={placeholder} disabled={disabled} maxLength={100}
        onChange={event => { onText(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onKeyDown={onKeyDown} />
      {busy ? <span className={styles.comboBusy} aria-hidden="true" /> : null}
    </div>
    <ul id={listId} role="listbox" aria-label={label} className={styles.comboList} hidden={!shown} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <li key={option.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}
        className={styles.comboOption} onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>{option.render ?? option.label}</li>)}
      {!options.length && empty ? <li role="presentation" className={styles.comboEmpty}>{empty}</li> : null}
    </ul>
  </div>;
}
