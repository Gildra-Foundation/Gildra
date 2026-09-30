"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Keyboard, X } from "lucide-react";
import {
  bindingFromKeyboardEvent, bindingFromMouseEvent, bindingFromWheelEvent,
  isRiskyActionBinding,
} from "./actionBarBindings";
import styles from "./actionBarBinding.module.css";

/** Input is captured only in this explicitly focused recorder, never across the page. */
export function ActionBarBindingEditor({ position, label, bindings, labelAt, ru, manuscript, onApply, onClose }: {
  position: number;
  label: string;
  bindings: readonly string[];
  labelAt: (position: number) => string;
  ru: boolean;
  manuscript: boolean;
  onApply: (key: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const captureRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(true);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const conflict = candidate ? bindings.findIndex((key, index) => index !== position && key === candidate) : -1;
  const record = useCallback((key: string | null) => {
    if (!key) return;
    setCandidate(key);
    setRecording(false);
    setNotice("");
  }, []);

  useEffect(() => {
    if (recording) captureRef.current?.focus({ preventScroll: true });
    else applyRef.current?.focus({ preventScroll: true });
  }, [recording]);

  useEffect(() => {
    const node = captureRef.current;
    if (!node || !recording) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== node) return;
      const key = bindingFromWheelEvent(event);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      record(key);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [record, recording]);

  return <section className={styles.editor} data-manuscript={manuscript || undefined} data-binding-editor aria-labelledby={`${id}-title`} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header>
      <div><small>{ru ? `ЯЧЕЙКА ${position + 1} · НАЗНАЧЕНИЕ КЛАВИШИ` : `SLOT ${position + 1} · KEY BINDING`}</small><strong id={`${id}-title`}>{label}</strong></div>
      <button type="button" className={styles.close} onClick={onClose} aria-label={ru ? "Отменить назначение клавиши" : "Cancel key binding"}><X size={18} /></button>
    </header>
    <div className={styles.captureRow}>
      <div ref={captureRef} role="group" tabIndex={0} className={styles.capture} data-recording={recording || undefined}
        aria-label={ru ? "Запись клавиши" : "Key recorder"} aria-describedby={`${id}-help`}
        onKeyDown={(event) => {
          if (!recording || event.key === "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat || event.nativeEvent.isComposing) return;
          const key = bindingFromKeyboardEvent(event.nativeEvent);
          if (key) record(key);
          else if (!/^(Shift|Control|Alt|Meta|AltGraph)$/.test(event.key)) setNotice(ru ? "Эту клавишу браузер не распознал. Попробуйте другую." : "The browser did not recognise this key. Try another.");
        }}
        onMouseDown={(event) => {
          if (!recording) return;
          captureRef.current?.focus({ preventScroll: true });
          const key = bindingFromMouseEvent(event.nativeEvent);
          if (key) { event.preventDefault(); event.stopPropagation(); record(key); }
        }}
        onMouseUp={(event) => { if (event.button !== 0) event.preventDefault(); }}
        onAuxClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onContextMenu={(event) => event.preventDefault()}>
        <Keyboard size={22} aria-hidden="true" />
        <span>{recording ? (ru ? "Нажмите клавишу или сочетание…" : "Press a key or combination…") : (ru ? "Новое назначение" : "New binding")}<kbd>{recording ? "…" : candidate?.split("+").map((part, index) => <span key={part}>{index > 0 ? "+" : ""}{part}</span>)}</kbd></span>
      </div>
      <div className={styles.actions}>
        {!recording && <button type="button" onClick={() => { setRecording(true); setNotice(""); }}>{ru ? "Другая клавиша" : "Record again"}</button>}
        <button ref={applyRef} type="button" disabled={!candidate || recording} onClick={() => candidate && onApply(candidate)}><Check size={15} />{conflict >= 0 ? (ru ? "Переназначить" : "Reassign") : (ru ? "Назначить" : "Assign")}</button>
        <button type="button" disabled={!bindings[position]} onClick={() => onApply("")}>{ru ? "Убрать бинд" : "Clear binding"}</button>
      </div>
    </div>
    <div className={styles.message} role="status" aria-live="polite">
      {conflict >= 0 ? <p>{ru ? `Уже назначено: ${labelAt(conflict)} (ячейка ${conflict + 1}). При подтверждении прежний бинд будет снят.` : `Already assigned: ${labelAt(conflict)} (slot ${conflict + 1}). Confirming will remove that binding.`}</p> : notice || (candidate ? <p>{ru ? "Нажмите «Назначить», чтобы сохранить." : "Choose Assign to save."}</p> : null)}
      {candidate && isRiskyActionBinding(candidate) && <p>{ru ? "Эту комбинацию может перехватывать браузер или система. Для тренировки надёжнее выбрать другую." : "Your browser or operating system may intercept this combination. Another binding is more reliable for training."}</p>}
    </div>
    <p id={`${id}-help`} className={styles.help}>{ru ? "Буквы (в том числе при русской раскладке), цифры, F-клавиши, NumPad, Tab, пробел и стрелки; Ctrl / Shift / Alt / Meta. Для мыши — наведите сюда и нажмите ПКМ, колесо, боковую кнопку или прокрутите колесо. Esc — отмена. ЛКМ оставлена для управления сайтом; системные сочетания могут быть недоступны." : "Letters (including non-Latin layouts), numbers, F-keys, NumPad, Tab, Space and arrows; Ctrl / Shift / Alt / Meta. For mouse bindings, use right/middle/side click or scroll over the recorder. Esc cancels. Left click is reserved for the interface; system shortcuts may be unavailable."}</p>
  </section>;
}
