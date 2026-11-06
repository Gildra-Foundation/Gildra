"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@gildra/atlas-ui/clipboard";
import styles from "./professions.module.css";

/** A game command the player pastes into chat, with a copy button; `label` names the button when the command is long. */
export function CopyCommand({ text, copy, copied, failed, label, show = true }: { text: string; copy: string; copied: string; failed: string; label?: string; show?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const run = async () => {
    try { await copyText(text); setState("done"); } catch { setState("error"); }
    window.setTimeout(() => setState("idle"), 1800);
  };
  return <span className={styles.command}>
    {show ? <code className={styles.code}>{text}</code> : null}
    <button type="button" className={styles.copyButton} onClick={run} aria-label={label ? undefined : `${copy}: ${text}`}>
      {state === "done" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span>{state === "done" ? copied : state === "error" ? failed : label ?? copy}</span>
    </button>
  </span>;
}
