"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
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

function SharedBuildActions({ locale, library, build, onProfileChange, onRoleChange }: Props & { build: Build }) {
  const t = sharedTalentBuildsCopy[locale];
  const [error, setError] = useState<BuildSaveError | "signIn" | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const decoded = decodeMythicTalentImport(build.code);
  const spec = decoded.ok ? playerSpecs.find(entry => entry.id === decoded.specId && entry.classId === decoded.classId) : undefined;
  if (!decoded.ok || !spec) return null;
  const existing = library.mode === "account" && library.builds.some(entry => entry.code === build.code);
  async function save() {
    if (library.mode !== "account" || library.busy || existing) return;
    const result = await library.save(build.name, build.code);
    setError(result.ok ? null : result.error); setSaved(result.ok);
  }
  async function connect() {
    setSigningIn(true); setError(null);
    try { const { signIn } = await import("next-auth/react"); await signIn("battlenet", { redirectTo: window.location.href }); }
    catch { setError("signIn"); setSigningIn(false); }
  }
  return <>
    <b className={styles.buildOwner}>{build.name}</b><p>{spec.className[locale]} · {spec.name[locale]}</p>
    <SharedTalentTreeButton code={build.code} locale={locale} />
    <div className={styles.importActions}><AtlasButton variant="ghost" onClick={() => { onProfileChange({ classId: decoded.classId, specId: decoded.specId, talentString: decoded.code }); onRoleChange(spec.role); }}>{t.apply}</AtlasButton>
      {library.mode === "guest" ? <AtlasButton disabled={signingIn} onClick={() => void connect()}>{signingIn ? t.signingIn : t.signIn}</AtlasButton> : <AtlasButton disabled={library.mode !== "account" || library.busy || existing} onClick={() => void save()}>{existing ? t.existing : t.save}</AtlasButton>}
    </div>
    {library.mode === "guest" && <p>{t.guest}</p>}
    {saved && <p role="status">{t.saved}</p>}
    {error && <p role="alert">{error === "signIn" ? t.signInError : savedTalentBuildsCopy[locale].errors[error]}</p>}
  </>;
}

export function SharedTalentBuild(props: Props) {
  const fragment = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const result = readSharedBuild(fragment), id = useId(), ref = useRef<HTMLElement>(null);
  useEffect(() => { if (fragment.startsWith("#mythic-build=")) { ref.current?.scrollIntoView({ block: "center", behavior: "instant" }); ref.current?.focus({ preventScroll: true }); } }, [fragment]);
  if (!result) return null;
  const t = sharedTalentBuildsCopy[props.locale];
  return <section ref={ref} tabIndex={-1} className={styles.sharedBuild} aria-labelledby={id} data-testid="shared-talent-build">
    <b id={id}>{t.received}</b>
    {result.ok ? <SharedBuildActions key={fragment + props.library.scope} {...props} build={result.build} /> : <p role="alert">{t.invalid}</p>}
    <AtlasButton variant="ghost" onClick={close}>{t.close}</AtlasButton>
  </section>;
}
