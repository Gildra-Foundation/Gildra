"use client";

import { BarChart3, Dumbbell, MousePointer2, Play, ShieldCheck, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

export function RotationLabGuide({ lang, open, busy, hasResult, onClose, onSimulation, onTraining }: {
  lang: Lang;
  open: boolean;
  busy: boolean;
  hasResult: boolean;
  onClose: () => void;
  onSimulation: () => void;
  onTraining: () => void;
}) {
  if (!open) return null;
  const ru = lang === "ru";

  return (
    <section className={styles.labGuide} aria-labelledby="rotation-guide-title">
      <header>
        <div>
          <span>{ru ? "БЫСТРЫЙ СТАРТ · 30 СЕКУНД" : "QUICK START · 30 SECONDS"}</span>
          <h2 id="rotation-guide-title">{ru ? "Зачем нужна эта страница?" : "What is this page for?"}</h2>
          <p>{ru ? "Она сначала показывает правильный прокаст, а затем помогает научиться повторять его без ошибок." : "It first shows the correct rotation, then helps you repeat it without mistakes."}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={ru ? "Закрыть объяснение" : "Close explanation"}><X /></button>
      </header>

      <div className={styles.labGuideChoice}>
        <button type="button" onClick={onSimulation} disabled={busy}>
          <span><BarChart3 /></span>
          <b>{ru ? "1. Узнай эталон" : "1. Find your benchmark"}</b>
          <small>{ru ? "Ничего настраивать не обязательно. Нажми — мы рассчитаем DPS и покажем ошибки." : "No setup required. We calculate DPS and point out mistakes."}</small>
          <i><Play /> {busy ? (ru ? "Считаем…" : "Calculating…") : hasResult ? (ru ? "Показать результат" : "Show result") : (ru ? "Запустить расчёт" : "Run simulation")}</i>
        </button>
        <div className={deferredLabStyles.labGuideArrow} aria-hidden="true">→</div>
        <button type="button" onClick={onTraining}>
          <span><Dumbbell /></span>
          <b>{ru ? "2. Отработай руками" : "2. Practice it"}</b>
          <small>{ru ? "После отсчёта жми только подсвеченный скилл. Следующая кнопка появится сама." : "After the countdown, press only the highlighted skill. The next one appears automatically."}</small>
          <i><MousePointer2 /> {ru ? "Открыть тренировку" : "Open training"}</i>
        </button>
      </div>

      <footer><ShieldCheck /> <span>{ru ? "Важно: лаборатория не нажимает кнопки в WoW и не играет за тебя — это безопасный тренажёр в браузере." : "The lab never presses buttons in WoW or plays for you — it is a safe browser trainer."}</span></footer>
    </section>
  );
}
