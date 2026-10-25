"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { TalentBuildCalculator } from "@/components/wow/shared/TalentBuildCalculator";
import { getTalentSpecThemeById } from "@/lib/talentSpecThemes";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import { encodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import { dungeonCalculatorCopy } from "./dungeonCalculatorCopy";
import { projectSharedTalentTree } from "@/lib/wow/sharedTalentTree";
import { changeSharedHero } from "@/lib/wow/sharedBuildDraft";
import { decodeMythicTalentTree } from "./mythicTalentImport";
import { sharedTalentTreeCopy } from "./sharedTalentTreeCopy";
import { sharedBuildDraftCopy } from "./sharedBuildDraftCopy";
import styles from "./sharedTalentTree.module.css";

type Locale = "ru" | "en";
type Loaded = { state: "ready"; data: TalentCalculatorData; initialCode: string; key: string } | { state: "loading" | "failed" | "mismatch" };

function LoadedCalculator({ value, locale, editing, onChange, onHeroChange, onValidityChange }: { value: Extract<Loaded, { state: "ready" }>; locale: Locale; editing: boolean; onChange: (code: string) => void; onHeroChange: (hero: number) => void; onValidityChange: (valid: boolean) => void }) {
  const theme = getTalentSpecThemeById(value.data.specId), [invalid, setInvalid] = useState(false);
  if (!theme) return null;
  return <>
    {editing && <label className={styles.heroPicker}>{sharedBuildDraftCopy[locale].hero}<AtlasValyroSelect native value={String(value.data.heroSubtreeId)} aria-label={sharedBuildDraftCopy[locale].hero} options={theme.heroPaths.map(path => ({ value: String(path.id), label: locale === "ru" ? path.nameRu : path.name }))} onValueChange={value => { if (theme.heroPaths.some(path => path.id === Number(value))) onHeroChange(Number(value)); }} /></label>}
    {invalid && <p role="alert">{sharedTalentTreeCopy[locale].mismatch}</p>}
    <div className={styles.calculatorHost} style={{ "--spec-accent": theme.accent, "--spec-hot": theme.hot, "--spec-deep": theme.deep, "--spec-rgb": theme.accentRgb, "--spec-hot-rgb": theme.hotRgb, "--tc-accent": theme.accent, "--tc-hot": theme.hot, "--tc-deep": theme.deep, "--tc-accent-rgb": theme.accentRgb, "--tc-hot-rgb": theme.hotRgb, "--tc-ambient-rgb": theme.ambientRgb } as CSSProperties}>
      <TalentBuildCalculator mode="shared" readOnly={!editing} data={value.data} specSlug={theme.slug} loadout={value.initialCode} localePrefix={locale === "ru" ? "/ru" : ""} onCandidateLoadoutChange={code => {
        try { projectSharedTalentTree(value.data, code); setInvalid(false); onValidityChange(true); onChange(code); }
        catch { setInvalid(true); onValidityChange(false); }
      }} />
    </div>
  </>;
}

export function SharedTalentTreeViewer({ code, locale, onClose, onCommit, initialSpecId, standalone = false, onChooseSpec, themeClassName }: { themeClassName?: string; initialSpecId?: number; standalone?: boolean; onChooseSpec?: () => void; code: string; locale: Locale; onClose: () => void; onCommit: (code: string) => void }) {
  const t = sharedTalentTreeCopy[locale], edit = sharedBuildDraftCopy[locale], calculator = dungeonCalculatorCopy[locale];
  const [valid, setValid] = useState(true);
  const [draft, setDraft] = useState(code), [editing, setEditing] = useState(standalone), [requestedHero, setRequestedHero] = useState<number | null>(null), [reset, setReset] = useState(0);
  const original = useMemo(() => decodeMythicTalentTree(code), [code]);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const specId = original.ok ? original.specId : initialSpecId;
  const theme = specId ? getTalentSpecThemeById(specId) : undefined;
  const hero = requestedHero ?? (original.ok && original.heroSubtreeId ? original.heroSubtreeId : theme?.heroPaths[0].id);
  const requestKey = specId ? `${specId}:${hero}:${locale}:${requestedHero !== null ? 1 : 0}:${reset}` : "invalid";
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" }), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(), [spec, hero, lang, explicitHero] = requestKey.split(":");
    if (!getTalentSpecThemeById(Number(spec))) return;
    const timer = window.setTimeout(() => { controller.abort(); setLoaded({ state: "failed" }); }, 25_000);
    void fetch(`/api/wow/shared-talent-tree?${new URLSearchParams({ spec, hero, lang })}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Tree unavailable");
      const data = await response.json() as TalentCalculatorData;
      if (controller.signal.aborted) return;
      try {
        if (!Array.isArray(data.loadoutNodes)) throw new Error("Calculator metadata missing");
        const startingCode = draftRef.current || encodeWoWTalentLoadout(data, new Map(Object.values(data.trees).flatMap(tree => tree.nodes.filter(node => node.freeNode).map(node => [node.id, node.maxRanks] as const))), new Map());
        const decoded = decodeMythicTalentTree(startingCode);
        const next = decoded.ok && explicitHero === "1" && decoded.heroSubtreeId !== data.heroSubtreeId ? changeSharedHero(data, startingCode) : startingCode;
        projectSharedTalentTree(data, next);
        setValid(true); setDraft(next); setLoaded({ state: "ready", data, initialCode: next, key: requestKey });
      } catch { setLoaded({ state: "mismatch" }); }
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ state: "failed" }); }).finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [requestKey, attempt]);
  return <AtlasDialog open onClose={onClose} label={standalone ? calculator.title : t.title} className={`${styles.dialog} ${themeClassName ?? ""}`} variant="sheet">
    <header className={styles.header}><h2>{standalone ? calculator.title : t.title}</h2><AtlasButton variant="ghost" onClick={onClose}>{standalone ? calculator.close : t.close}</AtlasButton></header>
    <div className={styles.body} data-testid="shared-talent-tree"><p>{standalone ? calculator.hint : editing ? edit.hint : t.hint}</p><div className={styles.editActions}>{onChooseSpec && <AtlasButton variant="ghost" onClick={onChooseSpec}>{calculator.chooseSpec}</AtlasButton>}{!editing ? <AtlasButton onClick={() => setEditing(true)}>{edit.edit}</AtlasButton> : <><AtlasButton onClick={() => { onCommit(draft); onClose(); }} disabled={!valid || draft === code || loaded.state !== "ready" || loaded.key !== requestKey}>{standalone ? calculator.apply : edit.use}</AtlasButton><AtlasButton variant="ghost" onClick={() => { setDraft(code); setRequestedHero(null); setReset(value => value + 1); }}>{standalone ? calculator.reset : edit.reset}</AtlasButton></>}</div>
      {loaded.state === "loading" || (loaded.state === "ready" && loaded.key !== requestKey) ? <p role="status">{t.loading}</p> : loaded.state === "ready" ? <LoadedCalculator key={requestKey} value={loaded} locale={locale} editing={editing} onChange={setDraft} onHeroChange={setRequestedHero} onValidityChange={setValid} /> : <div role="alert"><p>{loaded.state === "mismatch" ? t.mismatch : t.failed}</p><AtlasButton onClick={() => { setLoaded({ state: "loading" }); setAttempt(value => value + 1); }}>{t.retry}</AtlasButton></div>}
    </div>
  </AtlasDialog>;
}
