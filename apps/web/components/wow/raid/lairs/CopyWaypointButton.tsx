"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@gildra/atlas-ui/clipboard";
import styles from "./lairs.module.css";

type Labels = { label: string; copied: string; failed: string };

/** Copies a TomTom /way command; the raw command stays in the tooltip, not on the page. */
export function CopyWaypointButton({ waypoint, labels }: { waypoint: string; labels: Labels }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await copyText(waypoint);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  }
  const message = status === "copied" ? labels.copied : status === "error" ? labels.failed : labels.label;
  return (
    <button type="button" className={styles.waypoint} onClick={copy} data-status={status} title={waypoint}>
      {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{message}</span>
    </button>
  );
}
