"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BarChart3, CheckCircle2, Gamepad2, Pause, Play, RotateCcw, Settings2, Square, Zap } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationAbility, RotationSequenceSource } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import { RotationAbilitySigil } from "./RotationAbilitySigil";
import { TrainerBarConfig } from "./TrainerBarConfig";
import { rotationAbilityVisual, rotationVisualStyle } from "./rotationVisualTheme";
import { useRotationTrainer } from "./useRotationTrainer";
import { actionBindingLabel } from "./actionBarBindings";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

const clock = (ms: number) => { const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };
const compactDps = (value: number | null) => value === null ? "—" : value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

export function RotationTrainer({ abilities, rules, slug, lang, storageScope, characterSlug, dataMode, referenceDps, referenceApm, referenceSequence, referenceSequenceSource, comboSequence, comboSequenceSource, comboName, onActiveChange }: {
  abilities: RotationAbility[];
  rules: string[];
  slug: string;
  lang: Lang;
  storageScope: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
  referenceDps?: number | null;
  referenceApm?: number | null;
  referenceSequence?: string[];
  referenceSequenceSource?: RotationSequenceSource;
  comboSequence?: string[];
  comboSequenceSource?: RotationSequenceSource;
  comboName?: string;
  onActiveChange?: (active: boolean) => void;
}) {
  const tr = t(lang);
  const trainer = useRotationTrainer({ abilities, rules, slug, storageScope, characterSlug, dataMode, referenceDps, referenceApm, referenceSequence, referenceSequenceSource, comboSequence, comboSequenceSource });
  const [configOpen, setConfigOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const active = ["countdown", "running", "paused"].includes(trainer.state.phase);
  const complete = trainer.state.phase === "complete";
  const byId = useMemo(() => new Map(abilities.map((ability) => [ability.id, ability])), [abilities]);
  const expected = trainer.expectedId ? byId.get(trainer.expectedId) : null;
  const queue = complete ? [] : Array.from({ length: Math.min(7, Math.max(0, trainer.sequence.length - 1)) }, (_, index) => trainer.sequence[(trainer.state.step + index + 1) % trainer.sequence.length]);
  const missingNames = trainer.missingAbilityIds.map((id) => byId.get(id)?.name ?? id).join(", ");
  const feedback = trainer.state.lastPressCorrect === null ? tr("Press the highlighted skill") : trainer.state.lastPressCorrect ? tr("Perfect — keep the rhythm") : tr("Wrong skill — the target stays active");
  const totalInputs = trainer.state.correct + trainer.state.mistakes;
  const sampleReady = trainer.state.correct >= 3 && trainer.state.elapsedMs >= 2_000;
  const displayedAccuracy = totalInputs ? `${trainer.accuracy}%` : "—";
  const recommendation = !sampleReady ? tr("Complete at least three correct casts to unlock a reliable estimate.") : trainer.accuracy < 85 ? tr("Slow down and prioritize clean inputs before increasing your pace.") : trainer.apm < Math.round((referenceApm ?? 60) * .72) ? tr("Your accuracy is solid. Increase the pace while keeping the sequence clean.") : tr("Excellent rhythm. Repeat the drill until the opener feels automatic.");
  const ru = lang === "ru";
  const expectedVisual = expected ? rotationAbilityVisual(expected.id, slug) : null;
  const lastPressedVisual = trainer.state.lastPressedId ? rotationAbilityVisual(trainer.state.lastPressedId, slug) : null;
  const combatEffectKey = totalInputs && trainer.state.lastPressedId ? `${trainer.state.lastPressedId}-${totalInputs}` : null;
  const sourceLabels: Record<RotationSequenceSource, string> = ru ? {
    "simulation-trace": "журнал последнего расчёта SimulationCraft",
    "maintained-apl": "поддерживаемая APL специализации",
    "custom-apl": "изменённая вами APL",
    "saved-combo": "сохранённая комбинация",
    "imported-tag": "импортированный тег ротации",
    "burst-preset": "встроенный шаблон бурста",
  } : {
    "simulation-trace": "latest SimulationCraft trace",
    "maintained-apl": "maintained specialization APL",
    "custom-apl": "your custom APL",
    "saved-combo": "saved combo",
    "imported-tag": "imported rotation tag",
    "burst-preset": "built-in burst preset",
  };
  const storageLabel = dataMode === "battle-net" && characterSlug
    ? (ru ? "Панель синхронизируется с аккаунтом только для этого персонажа." : "The bar syncs to your account for this character only.")
    : storageScope === "reference"
    ? (ru ? "Панель автоматически сохраняется для этой специализации." : "The bar is saved automatically for this specialization.")
    : (ru ? "Панель автоматически сохраняется только для этого персонажа." : "The bar is saved automatically for this character only.");

  useEffect(() => onActiveChange?.(active), [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);
  useEffect(() => {
    if (!resetNotice) return;
    const timer = window.setTimeout(() => setResetNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [resetNotice]);

  const start = () => {
    if (!trainer.canStart) return setConfigOpen(true);
    setConfigOpen(false);
    setResetNotice("");
    trainer.start();
  };
  const resetDrill = () => {
    trainer.resetSession();
    setResetNotice(ru ? "Подход сброшен: таймер, DPS, точность и последовательность вернулись к началу." : "Drill reset: timer, DPS, accuracy, and sequence returned to the start.");
  };

  return (
    <section ref={trainer.inputRef} tabIndex={-1} id="rotation-trainer" className={styles.trainer} data-spec={slug} aria-labelledby="rotation-trainer-title">
      <header className={styles.trainerHeader}>
        <div className={styles.trainerHeading}><span><Gamepad2 /> {tr("MUSCLE MEMORY DRILL")}</span><h2 id="rotation-trainer-title">{tr("Rotation Training Ground")}</h2><p>{tr("Follow the highlighted ability with your keyboard or mouse. A mistake does not advance the combo.")} {ru ? "Кнопки мыши и колёсико работают над областью тренировки. Esc — пауза и возврат обычной навигации." : "Mouse bindings and wheel work over the training area. Esc pauses and restores normal navigation."}</p></div>
        <div className={styles.trainerControls}>
          <label><span>{tr("Drill")}</span><select value={trainer.drill} disabled={active || !trainer.hydrated} onChange={(event) => trainer.setDrill(event.target.value as "combo" | "burst" | "priority")}>{comboSequence?.length && <option value="combo">{comboName ?? (ru ? "Сохранённая комбинация" : "Saved combo")}</option>}<option value="burst">{tr("Burst Opener")}</option><option value="priority">{tr("Priority Recall")}</option></select></label>
          <label><span>{tr("Duration")}</span><select value={trainer.duration} disabled={active || !trainer.hydrated} onChange={(event) => trainer.setDuration(Number(event.target.value))}>{[30, 60, 120].map((value) => <option key={value} value={value}>{value} {ru ? "с" : "s"}</option>)}</select></label>
          <button className={styles.trainerConfigButton} disabled={active || !trainer.hydrated} aria-haspopup="dialog" aria-expanded={configOpen} onClick={() => setConfigOpen(true)}><Settings2 /> {tr("Configure Bar")}</button>
          {trainer.state.phase === "running" && <button className={styles.trainerPauseButton} onClick={trainer.pause}><Pause /> {tr("Pause")}</button>}
          {trainer.state.phase === "paused" && <button className={styles.trainerStartButton} onClick={trainer.resume}><Play /> {tr("Resume")}</button>}
          {active && <button className={styles.trainerResetButton} onClick={resetDrill} aria-label={ru ? "Сбросить подход и вернуться к началу" : "Reset drill and return to the start"}><RotateCcw /> {ru ? "Сбросить подход" : "Reset drill"}</button>}
          {active ? <button className={styles.trainerStopButton} onClick={trainer.stop}><Square /> {tr("Finish")}</button> : <button className={styles.trainerStartButton} disabled={!trainer.hydrated} onClick={start} aria-describedby={!trainer.canStart ? "trainer-config-error" : undefined}><Zap /> {complete ? tr("Train Again") : tr("Start Training")}</button>}
        </div>
      </header>

      {resetNotice && <div className={deferredLabStyles.trainerResetNotice} role="status"><CheckCircle2 /> {resetNotice}</div>}

      {!trainer.hydrated && <div id="trainer-config-error" className={styles.trainerValidation} role="status">{ru ? "Загружаем вашу раскладку…" : "Loading your action bar…"}</div>}
      {trainer.hydrated && !trainer.canStart && !active && <div id="trainer-config-error" className={styles.trainerValidation} role="alert"><strong>{tr("Action bar needs attention")}</strong><span>{missingNames ? `${tr("Bind the required skills")}: ${missingNames}.` : tr("Every required skill needs a unique key.")}</span><button onClick={() => { trainer.resetLayout(); setConfigOpen(true); }}><RotateCcw /> {tr("Restore required skills")}</button></div>}

      <TrainerBarConfig open={configOpen} lang={lang} abilities={abilities} slots={trainer.slots} storageLabel={storageLabel} onClose={() => setConfigOpen(false)} onUpdateSlot={trainer.updateSlot} onMoveSlot={trainer.moveSlot} onRemoveSlot={trainer.removeSlot} onAddSlot={trainer.addSlot} onReset={trainer.resetLayout} />

      <div className={styles.trainerProvenance} role="note">
        <span><small>{ru ? "ИСТОЧНИК ПОСЛЕДОВАТЕЛЬНОСТИ" : "SEQUENCE SOURCE"}</small><strong>{sourceLabels[trainer.sequenceSource]}</strong></span>
        <span><small>SIMULATIONCRAFT DPS</small><strong>{referenceDps && referenceDps > 0 ? compactDps(referenceDps) : "—"}</strong><em>{referenceDps && referenceDps > 0 ? (ru ? "эталон расчёта, не результат нажатий" : "simulation benchmark, not your keypress result") : (ru ? "сначала запустите расчёт" : "run a simulation first")}</em></span>
        <span><small>{ru ? "ОЦЕНКА ТРЕНИРОВКИ" : "TRAINING ESTIMATE"}</small><strong>{sampleReady ? compactDps(trainer.trainingDps) : "—"}</strong><em>{ru ? "только точность и темп относительно SimC" : "accuracy and pace relative to SimC only"}</em></span>
      </div>

      {!active && !complete && trainer.canStart && <div className={styles.trainerReadyNote} role="note"><CheckCircle2 /><span><strong>{ru ? "Всё готово" : "Ready to go"}</strong><small>{ru ? "Нажми «Начать тренировку», дождись 3–2–1 и жми только светящуюся способность. Следующий скилл появится сам — ресетить ничего не нужно." : "Press Start Training, wait for 3–2–1, and hit only the glowing ability. The next skill appears automatically."}</small></span></div>}

      <div className={styles.trainerBar} role="group" aria-label={tr("Training action bar")}>
        {trainer.slots.map((slot) => {
          const ability = byId.get(slot.abilityId);
          if (!ability) return null;
          const visual = rotationAbilityVisual(ability.id, slug);
          const isTarget = trainer.expectedId === ability.id && trainer.state.phase === "running";
          const wasPressed = trainer.state.lastPressedId === ability.id;
          return (
            <button
              key={ability.id}
              data-ability={ability.id}
              data-trainer-cast
              data-material={visual.material}
              style={rotationVisualStyle(visual)}
              disabled={trainer.state.phase !== "running"}
              onClick={() => trainer.press(ability.id)}
              className={`${styles.trainerSkill} ${isTarget ? styles.trainerSkillTarget : ""} ${wasPressed && trainer.state.lastPressCorrect ? styles.trainerSkillHit : ""} ${wasPressed && trainer.state.lastPressCorrect === false ? styles.trainerSkillMiss : ""}`}
              aria-label={`${tr("Cast")}: ${ability.name} (${slot.key})`}
            >
              <RotationAbilitySigil visual={visual} className={styles.trainerSkillSigil} />
              <kbd title={slot.key}>{actionBindingLabel(slot.key)}</kbd>
              <AbilityIcon ability={ability} size="lg" />
              <span>{ability.name}</span>
              {wasPressed && combatEffectKey && <i key={combatEffectKey} className={styles.trainerSkillImpact} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {complete ? (
        <section className={styles.sessionSummary} aria-labelledby="session-summary-title">
          <div className={styles.sessionSummaryHero}><CheckCircle2 /><span><small>{tr("SESSION COMPLETE")}</small><h3 id="session-summary-title">{sampleReady ? tr("Drill complete") : tr("Short practice saved")}</h3><p>{recommendation}</p></span></div>
          <div className={styles.sessionScore}><small>{tr("Training estimate")}</small><strong>{sampleReady ? compactDps(trainer.trainingDps) : "—"}</strong><span>{sampleReady ? (trainer.trainingDps ? tr("Estimated from your reference profile") : (ru ? "Нет SimC-бенчмарка — DPS не придумываем" : "No SimC benchmark — no DPS is invented")) : tr("Not enough data yet")}</span></div>
          <dl><div><dt>{tr("Active time")}</dt><dd>{clock(trainer.state.elapsedMs)}</dd></div><div><dt>{tr("Accuracy")}</dt><dd>{displayedAccuracy}</dd></div><div><dt>{tr("Best streak")}</dt><dd>{trainer.state.bestStreak}</dd></div><div><dt>{tr("Effective APM")}</dt><dd>{trainer.apm}</dd></div><div><dt>{tr("Avg. reaction")}</dt><dd>{trainer.averageReaction ? `${trainer.averageReaction} ${ru ? "мс" : "ms"}` : "—"}</dd></div><div><dt>{tr("Correct casts")}</dt><dd>{trainer.state.correct}</dd></div></dl>
          <div className={styles.sessionSummaryActions}><button onClick={start}><Zap /> {tr("Train Again")}</button><button onClick={resetDrill}><RotateCcw /> {ru ? "Сбросить результат" : "Reset result"}</button><button onClick={() => setConfigOpen(true)}><Settings2 /> {tr("Adjust action bar")}</button></div>
        </section>
      ) : (
        <div className={styles.trainerStage} data-phase={trainer.state.phase}>
          <div className={styles.trainerTarget} style={expectedVisual ? rotationVisualStyle(expectedVisual) : undefined} aria-live="polite">
            <div className={deferredLabStyles.trainerTargetRune} aria-hidden="true">{expectedVisual && <RotationAbilitySigil visual={expectedVisual} className={styles.trainerTargetSigil} />}</div>
            {combatEffectKey && lastPressedVisual && (
              <div key={combatEffectKey} className={`${styles.trainerCombatEffect} ${trainer.state.lastPressCorrect ? deferredLabStyles.trainerCombatHit : deferredLabStyles.trainerCombatMiss}`} style={rotationVisualStyle(lastPressedVisual)} aria-hidden="true">
                <RotationAbilitySigil visual={lastPressedVisual} className={styles.trainerCombatSigil} />
                <span className={styles.trainerCombatRing} />
                {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--rt-spark": index } as CSSProperties} />)}
                <strong>{trainer.state.lastPressCorrect ? (ru ? "В РИТМ" : "IN RHYTHM") : (ru ? "МИМО" : "MISS")}</strong>
              </div>
            )}
            <span>{trainer.state.phase === "paused" ? tr("SESSION PAUSED") : trainer.state.phase === "countdown" ? tr("GET READY") : tr("PRESS NEXT")}</span>
            {trainer.state.phase === "countdown" ? <strong className={deferredLabStyles.trainerCountdown}>{trainer.state.countdown}</strong> : expected && <div key={`${expected.id}-${trainer.state.correct}`} className={styles.trainerTargetCard}><AbilityIcon ability={expected} size="lg" /><strong>{expected.name}</strong><kbd>{actionBindingLabel(trainer.slots.find((slot) => slot.abilityId === expected.id)?.key ?? "")}</kbd></div>}
            <small className={trainer.state.lastPressCorrect === false ? styles.trainerFeedbackMiss : styles.trainerFeedbackHit}>{trainer.state.phase === "paused" ? tr("Resume when you are ready") : feedback}</small>
          </div>
          <div className={styles.trainerQueueWrap}><span>{tr("Coming next")}</span><ol className={styles.trainerQueue} aria-label={tr("Upcoming combo")}>{queue.map((abilityId, index) => { const ability = byId.get(abilityId); return ability ? <li key={`${abilityId}-${index}`}><i>{index + 2}</i><AbilityIcon ability={ability} size="sm" /><span>{ability.name}</span></li> : null; })}</ol></div>
          <div className={styles.trainerStats} aria-label={tr("Training session metrics")}>
            <span className={styles.trainerDps} title={tr("Training DPS is a drill estimate, not a SimulationCraft result.")}><small>{tr("Training estimate")}</small><strong>{sampleReady ? compactDps(trainer.trainingDps) : "—"}</strong></span>
            <span><small>{tr("Time")}</small><strong>{clock(trainer.state.remainingMs)}</strong></span><span><small>{tr("Accuracy")}</small><strong>{displayedAccuracy}</strong></span><span><small>{tr("Best streak")}</small><strong>{trainer.state.bestStreak}</strong></span><span><small>{tr("Effective APM")}</small><strong>{trainer.apm}</strong></span><span><small>{tr("Avg. reaction")}</small><strong>{trainer.averageReaction ? `${trainer.averageReaction} ${ru ? "мс" : "ms"}` : "—"}</strong></span><span><small>{tr("Combos")}</small><strong>{trainer.state.rounds}</strong></span>
          </div>
        </div>
      )}
      <p className={styles.trainerHint}><BarChart3 /> {tr("Training DPS is a drill estimate, not a SimulationCraft result.")} {tr("The trainer reads only the keys assigned above. It never casts abilities in World of Warcraft.")}</p>
    </section>
  );
}
