"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { copyText } from "@gildra/atlas-ui/clipboard";
import styles from "./leaderboard.module.css";

/**
 * The filter form is a plain GET form (works without JavaScript); with it, a
 * changed select applies at once and empty fields stay out of the URL.
 */
export function LeaderboardForm({ action, label, compact = false, children }: { action: string; label: string; compact?: boolean; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  function submit() {
    const element = form.current;
    if (!element) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(element)) {
      if (typeof value === "string" && value.trim()) params.set(name, value.trim());
    }
    const query = params.toString();
    router.push(`${action}${query ? `?${query}` : ""}#list`, { scroll: false });
  }
  return (
    <form
      ref={form}
      className={styles.filters}
      data-compact={compact || undefined}
      action={action}
      method="get"
      aria-label={label}
      onChange={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        // A new role or class makes a chosen specialization of another one meaningless.
        const spec = form.current?.elements.namedItem("spec");
        if ((target.name === "role" || target.name === "class") && spec instanceof HTMLSelectElement) spec.value = "";
        submit();
      }}
      onSubmit={(event) => { event.preventDefault(); submit(); }}
    >
      {children}
    </form>
  );
}

type Labels = { label: string; copied: string; failed: string };

/** Copies an in-game talent loadout string (paste it into the game's talent import). */
export function CopyLoadoutButton({ loadout, labels }: { loadout: string; labels: Labels }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await copyText(loadout);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  }
  return (
    <button type="button" className={styles.copy} onClick={copy} data-status={status}>
      {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{status === "copied" ? labels.copied : status === "error" ? labels.failed : labels.label}</span>
    </button>
  );
}
