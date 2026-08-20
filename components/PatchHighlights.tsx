"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { season, patchHighlights } from "@/data/site";
import { langOf, p, t } from "@/lib/i18n";

/** Компактный Patch Highlights: на desktop — лёгкая карточка,
 *  на mobile — свёрнутая строка-кнопка с аккордеоном. */
export function PatchHighlights() {
  const [open, setOpen] = useState(false);
  const lang = langOf(usePathname());
  const tt = t(lang);
  return (
    <div className={`patch${open ? " open" : ""}`}>
      <button
        className="patch-toggle"
        aria-expanded={open}
        aria-controls="patch-list"
        onClick={() => setOpen((v) => !v)}
      >
        {tt("Patch")} {season.patch} {tt("highlights")} · {patchHighlights.length}{" "}
        {tt("updates")}
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <h3 className="patch-title">{tt("PATCH HIGHLIGHTS")} {season.patch}</h3>
      <ul id="patch-list">
        {patchHighlights.map((h) => (
          <li key={h}>{tt(h)}</li>
        ))}
      </ul>
      <a className="more" href={p(lang, "/#guides")}>
        {tt("View full patch notes →")}
      </a>
    </div>
  );
}
