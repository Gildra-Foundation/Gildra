"use client";

import { useState } from "react";
import { season, patchHighlights } from "@/data/site";

/** Компактный Patch Highlights: на desktop — лёгкая карточка,
 *  на mobile — свёрнутая строка-кнопка с аккордеоном. */
export function PatchHighlights() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`patch${open ? " open" : ""}`}>
      <button
        className="patch-toggle"
        aria-expanded={open}
        aria-controls="patch-list"
        onClick={() => setOpen((v) => !v)}
      >
        Patch {season.patch} highlights · {patchHighlights.length} updates
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <h3 className="patch-title">PATCH {season.patch} HIGHLIGHTS</h3>
      <ul id="patch-list">
        {patchHighlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <a className="more" href="/#guides">
        View full patch notes →
      </a>
    </div>
  );
}
