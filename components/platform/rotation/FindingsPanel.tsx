"use client";

import { CheckCircle2, Clock3, Droplet, Swords } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationFinding } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function FindingsPanel({ findings, lang, onSelect, selectedTime }: {
  findings: RotationFinding[];
  lang: Lang;
  onSelect: (time: number) => void;
  selectedTime?: number;
}) {
  const tr = t(lang);
  return (
    <aside className={styles.findingsPanel} aria-labelledby="findings-title">
      <header className={styles.panelHeader}>
        <div><h2 id="findings-title">{tr("Lab Findings")}</h2><small>{tr("Select a finding to inspect it on the timeline")}</small></div>
        <span className={deferredLabStyles.findingCount}>{findings.length}</span>
      </header>
      <div className={deferredLabStyles.findingList} aria-live="polite">
        {findings.map((finding) => {
          const Icon = finding.kind === "overcap" ? Droplet : finding.kind === "drift" ? Clock3 : Swords;
          return (
            <button key={finding.id} aria-pressed={selectedTime === finding.time} onClick={() => onSelect(finding.time)} className={styles.finding}>
              <span className={`${styles.findingIcon} ${styles[finding.severity]}`}><Icon /></span>
              <span><b>{tr(finding.title)}</b><small>{tr(finding.detail)}</small></span>
              <time>{stamp(finding.time)}</time>
            </button>
          );
        })}
        {!findings.length && <p className={deferredLabStyles.noFindings}><CheckCircle2 /> {tr("No critical findings in this run.")}</p>}
      </div>
    </aside>
  );
}
