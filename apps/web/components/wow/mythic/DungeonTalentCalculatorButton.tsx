"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { usePlayerProfile } from "./usePlayerProfile";
import { usePullRole } from "./usePullRole";
import { playerClasses, playerSpecs, type PlayerProfile } from "./playerTools";
import { decodeMythicTalentImport } from "./mythicTalentImport";
import { playerToolsCopy } from "./playerToolsCopy";
import { dungeonCalculatorCopy } from "./dungeonCalculatorCopy";
import styles from "./sharedTalentTree.module.css";

const Viewer = dynamic(() => import("./SharedTalentTreeViewer").then(module => module.SharedTalentTreeViewer));
type Locale = "ru" | "en";
function CalculatorFlow({ locale, profile, onClose, onApply, themeClassName }: { locale: Locale; profile: PlayerProfile; onClose: () => void; onApply: (code: string) => void; themeClassName?: string }) {
  const t = dungeonCalculatorCopy[locale], p = playerToolsCopy[locale];
  const [classId, setClassId] = useState(profile.classId), [specId, setSpecId] = useState(profile.specId);
  const [openedSpec, setOpenedSpec] = useState(playerSpecs.some(s => s.id === profile.specId && s.classId === profile.classId) ? profile.specId : null);
  const decoded = profile.talentString ? decodeMythicTalentImport(profile.talentString) : null;
  const code = decoded?.ok && decoded.specId === openedSpec ? decoded.code : "";
  if (openedSpec) return <Viewer themeClassName={themeClassName} key={openedSpec} code={code} initialSpecId={openedSpec} standalone locale={locale} onClose={onClose} onCommit={onApply} onChooseSpec={() => setOpenedSpec(null)} />;
  return <AtlasDialog open onClose={onClose} label={t.title} className={`${styles.dialog} ${themeClassName ?? ""}`} variant="sheet">
    <header className={styles.header}><h2>{t.title}</h2><AtlasButton variant="ghost" onClick={onClose}>{t.close}</AtlasButton></header>
    <div className={styles.body}><p>{t.choose}</p><div className={styles.specPicker}>
      <label>{p.classLabel}<AtlasValyroSelect native aria-label={p.classLabel} value={String(classId ?? "")} onValueChange={value => { setClassId(Number(value) || null); setSpecId(null); }} options={[{ value: "", label: p.noClass }, ...playerClasses.map(c => ({ value: String(c.id), label: c.name[locale] }))]} /></label>
      <label>{p.specLabel}<AtlasValyroSelect native aria-label={p.specLabel} disabled={!classId} value={String(specId ?? "")} onValueChange={value => setSpecId(playerSpecs.find(s => s.id === Number(value) && s.classId === classId)?.id ?? null)} options={[{ value: "", label: p.noSpec }, ...playerSpecs.filter(s => s.classId === classId).map(s => ({ value: String(s.id), label: s.name[locale] }))]} /></label>
    </div><AtlasButton disabled={!specId} onClick={() => setOpenedSpec(specId)}>{t.openTree}</AtlasButton></div>
  </AtlasDialog>;
}

export function DungeonTalentCalculatorButton({ locale, themeClassName }: { locale: Locale; themeClassName?: string }) {
  const [open, setOpen] = useState(false), id = useId(), [profile, setProfile] = usePlayerProfile(), [, setRole] = usePullRole();
  function close() { setOpen(false); requestAnimationFrame(() => document.getElementById(id)?.focus()); }
  return <><AtlasButton id={id} aria-haspopup="dialog" aria-expanded={open} data-testid="dungeon-talent-calculator" onClick={() => setOpen(true)}>{dungeonCalculatorCopy[locale].title}</AtlasButton>{open && <CalculatorFlow themeClassName={themeClassName} locale={locale} profile={profile} onClose={close} onApply={code => {
    const decoded = decodeMythicTalentImport(code), spec = decoded.ok ? playerSpecs.find(s => s.id === decoded.specId && s.classId === decoded.classId) : undefined;
    if (decoded.ok && spec) { setProfile({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code }); setRole(spec.role); }
  }} />}</>;
}
