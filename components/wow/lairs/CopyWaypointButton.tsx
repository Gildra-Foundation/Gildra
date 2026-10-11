"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styles from "./lairs.module.css";

type Labels = { label: string; copied: string; failed: string };

/** Copies a TomTom /way command; shows the command so it can also be typed. */
export function CopyWaypointButton({ waypoint, labels }: { waypoint: string; labels: Labels }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(waypoint);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = waypoint;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy command was rejected");
      }
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  }
  const message = status === "copied" ? labels.copied : status === "error" ? labels.failed : labels.label;
  return (
    <button type="button" className={styles.waypoint} onClick={copy} data-status={status}>
      {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{message}</span>
      <code>{waypoint}</code>
    </button>
  );
}
