"use client";

import { useState } from "react";
import { p, t, type Lang } from "@/lib/i18n";
import { ANCHORS, anchorHref } from "@/lib/anchors";

/** Компактный Patch Highlights: на desktop — лёгкая карточка,
 *  на mobile — свёрнутая строка-кнопка с аккордеоном. */
export function PatchHighlights({
  patch,
  highlights,
  lang,
}: {
  patch: string;
  highlights: readonly string[];
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const tt = t(lang);
  return (
    <div className={`patch${open ? " open" : ""}`}>
      <button
        className="patch-toggle"
        aria-expanded={open}
        aria-controls="patch-list"
        onClick={() => setOpen((v) => !v)}
      >
        {tt("Patch")} {patch} {tt("highlights")} · {highlights.length}{" "}
        {tt("updates")}
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <h3 className="patch-title">{tt("PATCH HIGHLIGHTS")} {patch}</h3>
      <ul id="patch-list">
        {highlights.map((h) => (
          <li key={h}>{tt(h)}</li>
        ))}
      </ul>
      <a className="more" href={p(lang, anchorHref(ANCHORS.guides))}>
        {tt("View full patch notes →")}
      </a>
    </div>
  );
}
