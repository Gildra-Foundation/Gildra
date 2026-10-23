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
import { ShareTalentBuild } from "./ShareTalentBuild";
import { SharedTalentBuild } from "./SharedTalentBuild";
import styles from "./mdtPullMap.module.css";

type Locale = "ru" | "en";
function BuildNameForm({ locale, name, existing, disabled, onSave }: { locale: Locale; name: string; existing: boolean; disabled: boolean; onSave: (name: string) => Promise<BuildSaveResult> }) {
  const t = savedTalentBuildsCopy[locale], id = useId();
  const [draft, setDraft] = useState(name);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<BuildSaveError | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || pending) return;
    setPending(true);
    try { const result = await onSave(dirty ? draft : name); setError(result.ok ? null : result.error); if (result.ok) setDirty(false); }
    catch { setError("network"); }
    finally { setPending(false); }
  }
  return <form className={styles.buildNameForm} onSubmit={submit} data-testid="save-talent-build">
    <label htmlFor={id}>{t.name}</label>
    <div className={styles.buildNameActions}><AtlasInput id={id} value={dirty ? draft : name} disabled={disabled || pending} onChange={event => { setDraft(event.target.value); setDirty(true); setError(null); }} placeholder={t.placeholder} maxLength={maxBuildNameLength} autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><AtlasButton type="submit" disabled={disabled || pending || !(dirty ? draft : name).trim()}>{pending ? t.saving : existing ? t.rename : t.save}</AtlasButton></div>
    {error && <p id={`${id}-error`} role="alert">{t.errors[error]}</p>}
  </form>;
}

export function SavedTalentBuilds({ locale, result, onProfileChange, onRoleChange }: { locale: Locale; result: TalentImportResult | null; onProfileChange: (profile: PlayerProfile) => void; onRoleChange: (role: PullRole) => void }) {
  const t = savedTalentBuildsCopy[locale], id = useId();
  const library = useSavedTalentBuilds();
  const [failure, setFailure] = useState<{ id: string; code: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; code: string; scope: string } | null>(null);
  const [actionError, setActionError] = useState<BuildSaveError | null>(null);
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
    setFailure(null); setMessage(null); setActionError(null);
    onProfileChange({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code });
    onRoleChange(spec.role);
  }
  async function remove(buildId: string) {
    const removed = await library.remove(buildId);
    if (!removed.ok) { setActionError(removed.error); return; }
    setActionError(null); setFailure(null); setMessage({ text: t.deleted, code: currentCode, scope: library.scope }); focusPicker();
  }
  async function migrate() {
    const moved = await library.migrate();
    if (!moved.ok) { setActionError(moved.error); return; }
    setActionError(null); setMessage({ text: t.migrated, code: currentCode, scope: library.scope });
  }
  return <section className={styles.savedBuilds} aria-labelledby={`${id}-title`} data-testid="saved-talent-builds">
    <SharedTalentBuild locale={locale} library={library} onProfileChange={onProfileChange} onRoleChange={onRoleChange} />
    <b id={`${id}-title`} tabIndex={-1}>{t.title}</b>
    {library.mode === "loading" && <p role="status">{t.checking}</p>}
    {library.mode === "guest" && <p>{t.guest} <a href={locale === "ru" ? "/ru/login" : "/login"}>{t.signIn}</a></p>}
    {library.mode === "account" && <p className={styles.buildOwner} data-testid="talent-builds-owner"><b>{t.accountLabel}: {library.accountName ?? t.connectedAccount}</b></p>}
    {library.mode === "account" && <p data-testid="talent-builds-account-status" role="status">{library.busy ? t.saving : t.account}</p>}
    {library.mode === "error" && <div role="alert"><p>{t.connectionError}</p><AtlasButton variant="ghost" onClick={() => void library.refresh()}>{t.retry}</AtlasButton></div>}
    {library.mode === "account" && library.localCount > 0 && <AtlasButton disabled={library.busy} onClick={() => void migrate()} data-testid="migrate-talent-builds">{t.migrate} ({library.localCount})</AtlasButton>}
    {library.mode === "account" && library.localInvalidCount > 0 && <p>{t.localInvalid}</p>}
    {entries.length ? <>
      <label htmlFor={id}>{t.label}</label>
      <div className={styles.savedBuildActions}><AtlasValyroSelect disabled={library.busy} native size="lg" placeholder={t.choose} id={id} aria-label={t.label} value={active?.id ?? ""} onValueChange={choose} options={entries.map(entry => ({ value: entry.id, label: `${entry.name} · ${entry.spec ? `${entry.spec.className[locale]} — ${entry.spec.name[locale]}` : t.outdated}` }))} />{active && <AtlasButton disabled={library.busy} variant="ghost" onClick={() => void remove(active.id)}>{t.remove}</AtlasButton>}</div>
      <p>{t.hint}</p>
      {active?.decoded.ok && <ShareTalentBuild key={JSON.stringify([active.name, active.code])} locale={locale} build={active} />}
    </> : library.mode === "guest" || library.mode === "account" ? <p>{library.mode === "account" ? t.accountEmpty : t.empty}</p> : null}
    {result?.ok && <BuildNameForm key={JSON.stringify([library.scope, result.code, active?.id])} locale={locale} name={active?.name ?? ""} existing={Boolean(active)} disabled={library.mode === "loading" || library.mode === "error" || library.busy} onSave={async name => { const saved = await library.save(name, result.code); if (saved.ok) { setActionError(null); setFailure(null); setMessage({ text: saved.duplicate ? t.duplicate : active ? t.renamed : t.saved, code: currentCode, scope: library.scope }); focusPicker(); } return saved; }} />}
    {failed && <div role="alert" className={styles.buildFailure}><p><b>{failed.name}</b>: {t.unavailable}</p><AtlasButton disabled={library.busy} variant="ghost" onClick={() => void remove(failed.id)}>{t.remove}</AtlasButton></div>}
    {library.corrupt && <p>{t.corrupt}</p>}
    {!library.persistent && <p role="status">{t.memoryOnly}</p>}
    {actionError && <p role="alert">{t.errors[actionError]}</p>}
    {message?.code === currentCode && message.scope === library.scope && <p role="status">{message.text}</p>}
  </section>;
}
