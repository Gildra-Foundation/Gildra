"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { decodeMythicTalentImport, type TalentImportResult } from "./mythicTalentImport";
import { playerSpecs, type PlayerProfile } from "./playerTools";
import type { PullRole } from "./mdtPullIntel";
import { maxBuildNameLength, type BuildSaveError, type BuildSaveResult } from "./savedTalentBuilds";
import { useSavedTalentBuilds } from "./useSavedTalentBuilds";
import { savedTalentBuildsCopy } from "./savedTalentBuildsCopy";
import styles from "./mdtPullMap.module.css";

type Locale = "ru" | "en";
function BuildNameForm({ locale, name, existing, onSave }: { locale: Locale; name: string; existing: boolean; onSave: (name: string) => BuildSaveResult }) {
  const t = savedTalentBuildsCopy[locale], id = useId();
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<BuildSaveError | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = onSave(draft);
    setError(result.ok ? null : result.error);
  }
  return <form className={styles.buildNameForm} onSubmit={submit} data-testid="save-talent-build">
    <label htmlFor={id}>{t.name}</label>
    <div className={styles.buildNameActions}><AtlasInput id={id} value={draft} onChange={event => { setDraft(event.target.value); setError(null); }} placeholder={t.placeholder} maxLength={maxBuildNameLength} autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><AtlasButton type="submit" disabled={!draft.trim()}>{existing ? t.rename : t.save}</AtlasButton></div>
    {error && <p id={`${id}-error`} role="alert">{t.errors[error]}</p>}
  </form>;
}

export function SavedTalentBuilds({ locale, result, onProfileChange, onRoleChange }: { locale: Locale; result: TalentImportResult | null; onProfileChange: (profile: PlayerProfile) => void; onRoleChange: (role: PullRole) => void }) {
  const t = savedTalentBuildsCopy[locale], id = useId();
  const library = useSavedTalentBuilds();
  const [failure, setFailure] = useState<{ id: string; code: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; code: string } | null>(null);
  const currentCode = result?.ok ? result.code : "";
  const entries = useMemo(() => library.builds.map(build => {
    const decoded = decodeMythicTalentImport(build.code);
    const spec = decoded.ok ? playerSpecs.find(spec => spec.id === decoded.specId && spec.classId === decoded.classId) : undefined;
    return { ...build, decoded, spec };
  }), [library.builds]);
  const active = result?.ok ? entries.find(entry => entry.decoded.ok && entry.decoded.code === result.code) : undefined;
  const failed = failure?.code === currentCode ? entries.find(entry => entry.id === failure.id) : undefined;
  function focusPicker() { requestAnimationFrame(() => (document.getElementById(id) ?? document.getElementById(`${id}-title`))?.focus()); }
  function choose(buildId: string) {
    const entry = entries.find(entry => entry.id === buildId);
    if (!entry) return;
    const decoded = decodeMythicTalentImport(entry.code);
    const spec = decoded.ok ? playerSpecs.find(spec => spec.id === decoded.specId && spec.classId === decoded.classId) : undefined;
    if (!decoded.ok || !spec) { setFailure({ id: buildId, code: currentCode }); setMessage(null); return; }
    setFailure(null); setMessage(null);
    onProfileChange({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code });
    onRoleChange(spec.role);
  }
  function remove(buildId: string) {
    library.remove(buildId); setFailure(null); setMessage({ text: t.deleted, code: currentCode }); focusPicker();
  }
  return <section className={styles.savedBuilds} aria-labelledby={`${id}-title`} data-testid="saved-talent-builds">
    <b id={`${id}-title`} tabIndex={-1}>{t.title}</b>
    {entries.length ? <>
      <label htmlFor={id}>{t.label}</label>
      <div className={styles.savedBuildActions}><AtlasValyroSelect native size="lg" placeholder={t.choose} id={id} aria-label={t.label} value={active?.id ?? ""} onValueChange={choose} options={entries.map(entry => ({ value: entry.id, label: `${entry.name} · ${entry.spec ? `${entry.spec.className[locale]} — ${entry.spec.name[locale]}` : t.outdated}` }))} />{active && <AtlasButton variant="ghost" onClick={() => remove(active.id)}>{t.remove}</AtlasButton>}</div>
      <p>{t.hint}</p>
    </> : <p>{t.empty}</p>}
    {result?.ok && <BuildNameForm key={JSON.stringify([result.code, active?.id, active?.name])} locale={locale} name={active?.name ?? ""} existing={Boolean(active)} onSave={name => { const saved = library.save(name, result.code); if (saved.ok) { setFailure(null); setMessage({ text: active ? t.renamed : t.saved, code: currentCode }); focusPicker(); } return saved; }} />}
    {failed && <div role="alert" className={styles.buildFailure}><p><b>{failed.name}</b>: {t.unavailable}</p><AtlasButton variant="ghost" onClick={() => remove(failed.id)}>{t.remove}</AtlasButton></div>}
    {library.corrupt && <p>{t.corrupt}</p>}
    {!library.persistent && <p role="status">{t.memoryOnly}</p>}
    {message?.code === currentCode && <p role="status">{message.text}</p>}
  </section>;
}
