"use client";

import { useId, useState } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { sharedBuildUrl, type SharedTalentBuild } from "./sharedTalentBuilds";
import { sharedTalentBuildsCopy } from "./sharedTalentBuildsCopy";
import styles from "./mdtPullMap.module.css";

/** Clipboard denial still leaves a selectable, working link. */
export function ShareTalentBuild({ locale, build }: { locale: "ru" | "en"; build: SharedTalentBuild }) {
  const t = sharedTalentBuildsCopy[locale], id = useId();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  async function share() {
    if (busy) return;
    setBusy(true);
    const url = sharedBuildUrl(window.location.href, build);
    setLink(url); setCopied(false);
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { /* Manual copy remains available without clipboard permission. */ }
    finally { setBusy(false); }
  }
  return <div className={styles.buildShare} data-testid="share-talent-build">
    <AtlasButton variant="ghost" disabled={busy} onClick={() => void share()}>{t.share}</AtlasButton>
    {link && <><label htmlFor={id}>{t.link}</label><AtlasInput id={id} value={link} readOnly dir="ltr" onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} /><p role="status">{copied ? t.copied : t.copyManually}</p><p>{t.snapshot}</p></>}
  </div>;
}
