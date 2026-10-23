"use client";

import { useId, useState, type FormEvent } from "react";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { decodeMythicTalentImport, maxTalentStringLength, type TalentImportError, type TalentImportResult } from "./mythicTalentImport";
import { playerSpecs, type PlayerProfile } from "./playerTools";
import type { PullRole } from "./mdtPullIntel";
import { SavedTalentBuilds } from "./SavedTalentBuilds";
import { talentImportCopy } from "./talentImportCopy";
import styles from "./mdtPullMap.module.css";

export function TalentImportPanel({ locale, profile, result, onProfileChange, onRoleChange }: { locale: "ru" | "en"; profile: PlayerProfile; result: TalentImportResult | null; onProfileChange: (profile: PlayerProfile) => void; onRoleChange: (role: PullRole) => void }) {
  const t = talentImportCopy[locale];
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<TalentImportError | null>(null);
  const spec = result?.ok ? playerSpecs.find(entry => entry.id === result.specId) : undefined;
  function apply(event: FormEvent) {
    event.preventDefault();
    const decoded = decodeMythicTalentImport(draft);
    if (!decoded.ok) { setError(decoded.error); return; }
    const importedSpec = playerSpecs.find(entry => entry.id === decoded.specId && entry.classId === decoded.classId);
    if (!importedSpec) { setError("spec"); return; }
    onProfileChange({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code });
    onRoleChange(importedSpec.role);
    setError(null);
    setDraft("");
  }
  return <div className={styles.importPanel} data-testid="talent-build-panel">
    <SavedTalentBuilds locale={locale} result={result} onProfileChange={next => { onProfileChange(next); setError(null); setDraft(""); }} onRoleChange={onRoleChange} />
    <form className={styles.importForm} onSubmit={apply} data-testid="pull-talent-import">
    <label htmlFor={id}>{t.label}</label>
    <p id={`${id}-help`}>{t.help}</p>
    <AtlasInput id={id} className={styles.codeInput} type="text" dir="ltr" value={draft} onChange={event => { setDraft(event.target.value); setError(null); }} placeholder={t.placeholder} maxLength={maxTalentStringLength} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} />
    <div className={styles.importActions}><AtlasButton type="submit" disabled={!draft.trim()}>{t.apply}</AtlasButton>{profile.talentString && <AtlasButton variant="ghost" onClick={() => { onProfileChange({ classId: profile.classId, specId: profile.specId }); setError(null); setDraft(""); }}>{t.clear}</AtlasButton>}</div>
    {error && <p id={`${id}-error`} role="alert" data-testid="talent-import-error">{t.errors[error]} {t.unchanged}</p>}
    <div role="status" className={styles.importStatus} data-testid="talent-import-status" data-import-state={result ? result.ok ? "applied" : "invalid" : "none"}>
      {result?.ok && spec ? <><b>{t.applied}: {spec.className[locale]} · {spec.name[locale]}</b><p>{t.active}</p>{!result.hashChecked && <p>{t.hashless}</p>}</> : <p>{result ? t.savedInvalid : t.none}</p>}
    </div>
  </form></div>;
}
