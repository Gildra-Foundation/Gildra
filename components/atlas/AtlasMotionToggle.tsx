"use client";

import { useSyncExternalStore } from "react";
import { setSiteMotionReduced, siteMotionReduced, subscribeSiteMotion } from "@/lib/client/motionPreference";
import styles from "./AtlasFrame.module.css";

const copy = {
  en: { label: "Less motion", on: "on", off: "off" },
  ru: { label: "Меньше движения", on: "вкл", off: "выкл" },
} as const;

/** Footer switch of every inner page: stills the atmosphere, reveals and page transitions for this reader. */
export function AtlasMotionToggle({ locale }: { locale: "en" | "ru" }) {
  const reduced = useSyncExternalStore(subscribeSiteMotion, siteMotionReduced, () => false);
  const t = copy[locale];
  return (
    <button type="button" className={styles.motionToggle} aria-pressed={reduced} onClick={() => setSiteMotionReduced(!reduced)}>
      <span className={styles.motionSwitch} aria-hidden="true" />
      {t.label}
      <span className="sr-only">: {reduced ? t.on : t.off}</span>
    </button>
  );
}
