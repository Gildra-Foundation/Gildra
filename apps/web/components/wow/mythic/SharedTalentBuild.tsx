"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { sharedBuildDraftCopy } from "./sharedBuildDraftCopy";
import { sharedBuildUrl } from "./sharedTalentBuilds";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { readSharedBuild, type SharedTalentBuild as Build } from "./sharedTalentBuilds";
import { sharedTalentBuildsCopy } from "./sharedTalentBuildsCopy";
import { savedTalentBuildsCopy } from "./savedTalentBuildsCopy";
import { decodeMythicTalentImport } from "./mythicTalentImport";
import { playerSpecs, type PlayerProfile } from "./playerTools";
import type { PullRole } from "./mdtPullIntel";
import type { BuildSaveError } from "./savedTalentBuilds";
import type { useSavedTalentBuilds } from "./useSavedTalentBuilds";
import styles from "./mdtPullMap.module.css";
import { SharedTalentTreeButton } from "./SharedTalentTreeButton";

type Props = { locale: "ru" | "en"; library: ReturnType<typeof useSavedTalentBuilds>; onProfileChange: (profile: PlayerProfile) => void; onRoleChange: (role: PullRole) => void };
function subscribe(notify: () => void) { window.addEventListener("hashchange", notify); window.addEventListener("popstate", notify); return () => { window.removeEventListener("hashchange", notify); window.removeEventListener("popstate", notify); }; }
const snapshot = () => window.location.hash;
const serverSnapshot = () => "";
function close() { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); window.dispatchEvent(new HashChangeEvent("hashchange")); requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="saved-talent-builds"] > b')?.focus()); }

function SharedBuildActions({ locale, library, build, current, onDraftChange, onProfileChange, onRoleChange }: Props & { build: Build; current: Build; onDraftChange: (build: Build) => void }) {
  const t = sharedTalentBuildsCopy[locale], edit = sharedBuildDraftCopy[locale], inputId = useId();
  const dirty = current.code !== build.code;
  const [error, setError] = useState<BuildSaveError | "signIn" | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [savedCode, setSavedCode] = useState("");
  const decoded = decodeMythicTalentImport(current.code);
  const spec = decoded.ok ? playerSpecs.find(entry => entry.id === decoded.specId && entry.classId === decoded.classId) : undefined;
  if (!decoded.ok || !spec) return null;
  const existing = library.mode === "account" && library.builds.some(entry => entry.code === current.code);
  async function save() {
    if (library.mode !== "account" || library.busy || existing) return;
    const result = await library.save(current.name, current.code);
    setError(result.ok ? null : result.error); setSavedCode(result.ok ? current.code : "");
  }
  async function connect() {
    setSigningIn(true); setError(null);
    try { const { signIn } = await import("next-auth/react"); await signIn("battlenet", { redirectTo: dirty ? sharedBuildUrl(window.location.href, current) : window.location.href }); }
    catch { setError("signIn"); setSigningIn(false); }
  }
  return <>
    <b className={styles.buildOwner}>{build.name}</b><p>{spec.className[locale]} · {spec.name[locale]}</p>
    <SharedTalentTreeButton code={current.code} locale={locale} onChange={code => { const suffix = edit.suffix; const base = Array.from(build.name).reduce((out, char) => out.length + char.length <= 64 - suffix.length ? out + char : out, ""); onDraftChange({ code, name: dirty ? current.name : base + suffix }); }} />
    {dirty && <><p>{edit.edited}. {edit.hint}</p><label htmlFor={inputId}>{edit.name}</label><AtlasInput id={inputId} value={current.name} maxLength={64} onChange={event => onDraftChange({ ...current, name: event.target.value })} /><AtlasButton variant="ghost" onClick={() => onDraftChange(build)}>{edit.reset}</AtlasButton></>}
    <div className={styles.importActions}><AtlasButton variant="ghost" onClick={() => { onProfileChange({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code }); onRoleChange(spec.role); }}>{t.apply}</AtlasButton>
      {library.mode === "guest" ? <AtlasButton disabled={signingIn || !current.name.trim()} onClick={() => void connect()}>{signingIn ? t.signingIn : t.signIn}</AtlasButton> : <AtlasButton disabled={library.mode !== "account" || library.busy || existing || !current.name.trim()} onClick={() => void save()}>{existing ? t.existing : dirty ? edit.save : t.save}</AtlasButton>}
    </div>
    {library.mode === "guest" && <p>{t.guest}</p>}
    {savedCode === current.code && <p role="status">{t.saved}</p>}
    {error && <p role="alert">{error === "signIn" ? t.signInError : savedTalentBuildsCopy[locale].errors[error]}</p>}
  </>;
}

function SharedBuildDraft(props: Props & { build: Build }) {
  const [current, setCurrent] = useState(props.build);
  return <SharedBuildActions key={props.library.scope} {...props} current={current} onDraftChange={setCurrent} />;
}

export function SharedTalentBuild(props: Props) {
  const fragment = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const result = readSharedBuild(fragment), id = useId(), ref = useRef<HTMLElement>(null);
  useEffect(() => { if (fragment.startsWith("#mythic-build=")) { ref.current?.scrollIntoView({ block: "center", behavior: "instant" }); ref.current?.focus({ preventScroll: true }); } }, [fragment]);
  if (!result) return null;
  const t = sharedTalentBuildsCopy[props.locale];
  return <section ref={ref} tabIndex={-1} className={styles.sharedBuild} aria-labelledby={id} data-testid="shared-talent-build">
    <b id={id}>{t.received}</b>
    {result.ok ? <SharedBuildDraft key={fragment} {...props} build={result.build} /> : <p role="alert">{t.invalid}</p>}
    <AtlasButton variant="ghost" onClick={close}>{t.close}</AtlasButton>
  </section>;
}
