"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { sharedTalentTreeCopy } from "./sharedTalentTreeCopy";

const Viewer = dynamic(() => import("./SharedTalentTreeViewer").then(module => module.SharedTalentTreeViewer));

export function SharedTalentTreeButton({ code, locale, onChange }: { code: string; locale: "ru" | "en"; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false), id = useId();
  function close() { setOpen(false); requestAnimationFrame(() => document.getElementById(id)?.focus()); }
  return <><AtlasButton id={id} aria-haspopup="dialog" aria-expanded={open} variant="ghost" onClick={() => setOpen(true)}>{sharedTalentTreeCopy[locale].open}</AtlasButton>{open && <Viewer key={code} code={code} locale={locale} onClose={close} onCommit={onChange} />}</>;
}
