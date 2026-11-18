"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./auctionGearOptimizer.module.css";

type Count = { completed: number; total: number };

export function AuctionProgress({ label, counted, stageKey, locale }: {
  label: string; counted: Count | null; stageKey: string; locale: string;
}) {
  const sample = useRef<{ key: string; first: number; time: number; last: number } | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const completed = counted?.completed, total = counted?.total;
  useEffect(() => {
    const now = performance.now();
    if (completed === undefined || total === undefined) {
      sample.current = null;
      setEstimate(null);
      return;
    }
    const previous = sample.current;
    if (!previous || previous.key !== stageKey || completed < previous.last) {
      sample.current = { key: stageKey, first: completed, last: completed, time: now };
      setEstimate(null);
      return;
    }
    previous.last = completed;
    const elapsed = (now - previous.time) / 1000;
    const advanced = completed - previous.first;
    setEstimate(advanced >= 2 && elapsed >= 2 && completed < total
      ? Math.ceil(elapsed * (total - completed) / advanced) : null);
  }, [stageKey, completed, total]);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ru = locale === "ru";
  return <div className={styles.runProgress}>
    <strong role="status">{label}</strong>
    <progress aria-label={label} max={counted?.total ?? 1} value={counted?.completed} />
    <small>{counted ? (ru ? 'На этом этапе' : 'This stage') + ' · ' + counted.completed.toLocaleString(locale) + ' / ' + counted.total.toLocaleString(locale)
      : ru ? 'Время зависит от объёма расчёта' : 'Time depends on the amount of work'}
      {counted && estimate !== null && (ru ? ' · примерно ' : ' · about ') + (estimate >= 60 ? Math.ceil(estimate / 60) + (ru ? ' мин' : ' min') : estimate + (ru ? ' с' : ' s'))}
      {elapsed > 0 && (ru ? ' · прошло ' : ' · elapsed ') + Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0')}
    </small>
  </div>;
}
