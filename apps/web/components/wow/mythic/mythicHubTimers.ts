/** A key time limit is a fixed duration, never a running countdown. */
export function formatHubTimer(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds < 0) return "—";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Decorative comparison only; the exact duration is always printed beside it. */
export function hubTimerPercent(seconds: number, longest: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(longest) || longest <= 0) return 0;
  return Math.min(100, Math.max(0, seconds / longest * 100));
}

export const hubTimerCopy = {
  ru: {
    label: "Лимит на прохождение",
    units: "мин:сек",
    list: "Таймеры подземелий от короткого к длинному",
    duration: (seconds: number) => `${Math.floor(seconds / 60)} мин ${String(seconds % 60).padStart(2, "0")} сек`,
    snapshot: "По данным на",
    source: "Raider.IO",
  },
  en: {
    label: "Completion time limit",
    units: "min:sec",
    list: "Dungeon time limits, shortest first",
    duration: (seconds: number) => `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} sec`,
    snapshot: "Data checked on",
    source: "Raider.IO",
  },
} as const;
