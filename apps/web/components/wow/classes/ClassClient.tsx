"use client";

import { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { copyText } from "@gildra/atlas-ui/clipboard";
import styles from "./classCatalog.module.css";

type RoleFilterValue = "all" | "tank" | "healer" | "dps";

/**
 * Role filter of the class list: it marks the roster, and CSS hides the
 * specializations (and classes) of other roles. Without JavaScript all stay.
 */
export function RoleFilter({ target, label, labels }: { target: string; label: string; labels: Record<RoleFilterValue, string> }) {
  const [value, setValue] = useState<RoleFilterValue>("all");
  return (
    <AtlasSegmented
      className={styles.roleFilter}
      size="sm"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const role = next as RoleFilterValue;
        setValue(role);
        document.getElementById(target)?.setAttribute("data-role-filter", role);
      }}
      options={(Object.keys(labels) as RoleFilterValue[]).map((key) => ({ value: key, label: labels[key] }))}
    />
  );
}

/** Copies an in-game talent string. */
export function CopyBuildButton({ loadout, labels }: { loadout: string; labels: { copy: string; copied: string; failed: string } }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={styles.buildAction}
      data-state={state}
      onClick={async () => {
        const ok = await copyText(loadout).then(() => true, () => false);
        setState(ok ? "copied" : "failed");
        window.setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "copied" ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? labels.copied : state === "failed" ? labels.failed : labels.copy}</span>
    </button>
  );
}
