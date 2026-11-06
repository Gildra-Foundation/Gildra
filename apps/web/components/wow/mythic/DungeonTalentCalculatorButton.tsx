"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { usePlayerProfile } from "./usePlayerProfile";
import { usePullRole } from "./usePullRole";
import { dungeonCalculatorCopy } from "./dungeonCalculatorCopy";

// The dialogs and the talent decoder load on the first open (warmed on hover/focus).
const loadFlow = () => import("./DungeonTalentCalculatorFlow").then(module => module.DungeonTalentCalculatorFlow);
const CalculatorFlow = dynamic(loadFlow, { ssr: false });
type Locale = "ru" | "en";

export function DungeonTalentCalculatorButton({ locale, themeClassName }: { locale: Locale; themeClassName?: string }) {
  const [open, setOpen] = useState(false), id = useId(), [profile, setProfile] = usePlayerProfile(), [, setRole] = usePullRole();
  function close() { setOpen(false); requestAnimationFrame(() => document.getElementById(id)?.focus()); }
  return <><AtlasButton id={id} aria-haspopup="dialog" aria-expanded={open} data-testid="dungeon-talent-calculator" onPointerEnter={() => void loadFlow()} onFocus={() => void loadFlow()} onClick={() => setOpen(true)}>{dungeonCalculatorCopy[locale].title}</AtlasButton>{open && <CalculatorFlow themeClassName={themeClassName} locale={locale} profile={profile} onClose={close} onSelect={(next, spec) => { setProfile(next); setRole(spec.role); }} />}</>;
}
