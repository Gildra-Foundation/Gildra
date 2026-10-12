"use client";

import { useState } from "react";
import { AtlasButton } from "../AtlasButton";
import { AtlasDialog } from "../AtlasDialog";
import styles from "./gallery.module.css";

/** Gallery island: opens AtlasDialog in both variants. */
export function DialogDemo() {
  const [open, setOpen] = useState<"panel" | "sheet" | null>(null);
  return <>
    <div className={styles.row}>
      <AtlasButton variant="secondary" onClick={() => setOpen("panel")}>Open panel</AtlasButton>
      <AtlasButton variant="secondary" onClick={() => setOpen("sheet")}>Open sheet</AtlasButton>
    </div>
    {open ? (
      <AtlasDialog open onClose={() => setOpen(null)} label={`AtlasDialog ${open}`} variant={open}>
        <div className={styles.dialogBody}>
          <p>AtlasDialog · {open}. Esc, the backdrop or the button closes it; focus returns to the opener.</p>
          <AtlasButton onClick={() => setOpen(null)}>Close</AtlasButton>
        </div>
      </AtlasDialog>
    ) : null}
  </>;
}
