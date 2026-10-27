"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, Link2, LocateFixed, Pause, Play, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import {
  background as backgroundOf, chrModelId, dollLeft, dollRight, dollWeapons, frameFormat, transmogRaces, transmogSlots,
  type TransmogAppearance, type TransmogGender, type TransmogRace, type TransmogSetDetail, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { defaultTransmogState, parseTransmogState, serializeTransmogState, type TransmogState } from "@/lib/wow/transmog/state";
import { STARTER_SET_ID, starterSet } from "@/lib/wow/transmog/starter";
import { canvasBlob, composeFrame, downloadBlob } from "@/lib/wow/transmog/compose";
import { ItemPicker, SetPicker, apiLocale, appearancesUrl, defaultArmor, loadSetDetail, prefetchJson, qualityStyle, setsUrl } from "./TransmogPicker";
import { TransmogFramePanel, type FrameSettings } from "./TransmogFramePanel";
import { TransmogStage, type StageHandle, type StageStatus } from "./TransmogStage";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import { SlotGlyph } from "./TransmogSlotGlyph";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
type Looks = Partial<Record<TransmogSlot, TransmogAppearance>>;
type Snapshot = { looks: Looks; hidden: TransmogSlot[] };

/** Approximate first download of a mannequin (skeleton + model + textures, brotli), MB. */
function mannequinWeight(race: TransmogRace, gender: TransmogGender) {
  if (race === "troll") return gender === "m" ? 21 : 17;
  if (race === "goblin" && gender === "f") return 18;
  return 14;
}

/**
 * Posters of the starter outfit at the default camera in the 4:5 frame
 * (transparent WebP made with the studio's own export), shown until 3D is ready.
 */
const POSTERS: Partial<Record<`${TransmogRace}-${TransmogGender}`, string>> = {
  "human-m": "/assets/wow/transmog/posters/human-m.webp",
  "human-f": "/assets/wow/transmog/posters/human-f.webp",
};

/** Viewer slot of a look in a doll slot: weapons follow the hand, the rest their inventory type. */
function viewerSlot(slot: TransmogSlot, look: TransmogAppearance) {
  if (slot === "main-hand") return 21;
  if (slot === "off-hand") return 22;
  return look.inventoryType === 20 ? 20 : look.viewerSlot || look.inventoryType;
}

function wearSet(looks: Looks, detail: TransmogSetDetail): Looks {
  const next = { ...looks };
  for (const item of detail.items) next[item.slot] = item;
  return next;
}

/** 3D starts by itself unless the visitor saves data or is on a 2G/3G link. */
function autoLoad() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !connection?.saveData && !/(^|-)(2g|3g)$/.test(connection?.effectiveType ?? "");
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function TransmogStudio({ lang }: { lang: Lang }) {
  const c = transmogCopy[lang];
  const stageRef = useRef<StageHandle>(null);
  const [state, setState] = useState<TransmogState>(defaultTransmogState);
  const [looks, setLooks] = useState<Looks>(() => wearSet({}, starterSet[lang]));
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<TransmogSlot>("head");
  const [tab, setTab] = useState("items");
  const [wearingSet, setWearingSet] = useState<number | null>(STARTER_SET_ID);
  const [edited, setEdited] = useState(false);
  const [requested, setRequested] = useState(false);
  const [manual, setManual] = useState(false);
  const [stage, setStage] = useState<{ status: StageStatus; progress: number }>({ status: "idle", progress: 0 });
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const [exportState, setExportState] = useState<"idle" | "busy">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [light, setLight] = useState({ brightness: 1, contrast: 1, shadow: 0.6 });
  const [output, setOutput] = useState<{ scale: 1 | 2; type: FrameSettings["type"] }>({ scale: 1, type: "image/png" });
  const [maxScale, setMaxScale] = useState<1 | 2>(1);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<{ slot: TransmogSlot; look: TransmogAppearance } | null>(null);
  const [busySlots, setBusySlots] = useState<TransmogSlot[]>([]);
  const pendingRef = useRef<TransmogSlot[]>([]);

  // Restore a share link (the starter outfit is already on the doll from the first HTML).
  useEffect(() => {
    const parsed = parseTransmogState(new URLSearchParams(window.location.search));
    setState(parsed);
    setMaxScale(window.matchMedia("(pointer: coarse)").matches ? 1 : 2);
    if (autoLoad()) setRequested(true);
    else setManual(true);
    const ids = transmogSlots.map((slot) => parsed.looks[slot]).filter((id): id is number => Boolean(id));
    if (!ids.length) { setReady(true); return; }
    const controller = new AbortController();
    fetch(`/api/wow/transmog/appearances?ids=${ids.join(",")}&locale=${apiLocale(lang)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const { data } = await response.json() as { data: TransmogAppearance[] };
        const byId = new Map(data.map((entry) => [entry.modifiedAppearanceId, entry]));
        const restored: Looks = {};
        for (const slot of transmogSlots) {
          const entry = parsed.looks[slot] ? byId.get(parsed.looks[slot]!) : undefined;
          if (entry) restored[slot] = entry;
        }
        setLooks(restored);
        setWearingSet(null);
        setEdited(true);
      })
      .catch(() => { if (!controller.signal.aborted) setNotice(c.error); })
      .finally(() => setReady(true));
    return () => controller.abort();
  }, [c.error, lang]);

  // Keep the address bar a share link of the current outfit and frame.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const query = serializeTransmogState({ ...state, looks: edited ? Object.fromEntries(transmogSlots.filter((slot) => looks[slot]).map((slot) => [slot, looks[slot]!.modifiedAppearanceId])) : {} });
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [edited, looks, ready, state]);

  // Once 3D is ready, warm the first page of every slot and of the sets in idle time.
  useEffect(() => {
    if (stage.status !== "ready") return;
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    idle(() => {
      for (const slot of transmogSlots) prefetchJson(appearancesUrl(lang, slot, "", defaultArmor(slot, looks[slot])));
      prefetchJson(setsUrl(lang, "", 0));
    });
  }, [lang, stage.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const remember = useCallback(() => setHistory((previous) => [...previous.slice(-29), { looks, hidden: state.hidden }]), [looks, state.hidden]);
  const patch = useCallback((next: Partial<TransmogState>) => setState((previous) => ({ ...previous, ...next })), []);
  const markBusy = (slots: TransmogSlot[]) => { pendingRef.current = slots; };

  const pick = (slot: TransmogSlot, look: TransmogAppearance | undefined) => {
    remember();
    setWearingSet(null);
    setEdited(true);
    setPreview(null);
    if (look) markBusy([slot]);
    setLooks((previous) => {
      const next = { ...previous };
      if (look) next[slot] = look;
      else delete next[slot];
      return next;
    });
  };
  const toggleHidden = (slot: TransmogSlot) => {
    remember();
    setEdited(true);
    patch({ hidden: state.hidden.includes(slot) ? state.hidden.filter((entry) => entry !== slot) : [...state.hidden, slot] });
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory(history.slice(0, -1));
    setLooks(last.looks);
    setEdited(true);
    patch({ hidden: last.hidden });
  };
  const reset = () => {
    remember();
    setLooks({});
    setWearingSet(null);
    setEdited(true);
    patch({ hidden: [] });
  };
  const wear = async (summary: TransmogSetSummary) => {
    try {
      const detail = await loadSetDetail(lang, summary.id);
      remember();
      markBusy(detail.items.map((item) => item.slot));
      setLooks((previous) => wearSet(previous, detail));
      setWearingSet(detail.id);
      setEdited(true);
    } catch {
      setNotice(c.error);
    }
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice(c.copied);
    } catch {
      setNotice(c.copyFailed);
    }
  };

  const items = useMemo(() => {
    const map = new Map<number, number>();
    for (const slot of transmogSlots) {
      const look = preview?.slot === slot ? preview.look : looks[slot];
      if (look && (!state.hidden.includes(slot) || preview?.slot === slot)) map.set(viewerSlot(slot, look), look.displayId);
    }
    return map;
  }, [looks, preview, state.hidden]);

  const format = frameFormat(state.format);
  const backgroundDef = backgroundOf(state.background);
  const onStatus = useCallback((status: StageStatus, progress: number) => setStage({ status, progress }), []);
  const onBusy = useCallback((busy: boolean) => {
    if (busy) { setBusySlots(pendingRef.current); pendingRef.current = []; } else setBusySlots([]);
  }, []);

  const exportFrame = async () => {
    const handle = stageRef.current;
    if (!handle || exportState === "busy") return;
    const scale = Math.min(output.scale, maxScale);
    const width = format.width * scale, height = format.height * scale;
    setExportState("busy");
    setExportMessage(c.exporting);
    // Let the busy state paint before the viewer renders the full-size frame.
    await new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
    try {
      const model = await handle.capture(width, height);
      const root = document.documentElement;
      const heading = document.querySelector("h1");
      const canvas = await composeFrame({
        width, height, background: backgroundDef, model, ...light, title: state.title.trim(), subtitle: state.subtitle.trim(), mark: state.mark,
        displayFont: heading ? getComputedStyle(heading).fontFamily : "Georgia, serif",
        uiFont: getComputedStyle(root).fontFamily || "sans-serif",
      });
      const blob = await canvasBlob(canvas, output.type);
      const extension = blob.type === "image/webp" ? "webp" : "png";
      downloadBlob(blob, `gildra-transmog-${state.format}-${width}x${height}.${extension}`);
      const saved = c.exported(`${width}×${height}`, Math.max(1, Math.round(blob.size / 1024)));
      setExportMessage(output.type === "image/webp" && extension !== "webp" ? `${saved}. ${c.webpFallback}` : saved);
    } catch {
      setExportMessage(c.exportFailed);
    } finally {
      setExportState("idle");
    }
  };

  // Keyboard: / search, [ ] previous/next slot, Z (or Ctrl+Z) undo, H hide slot.
  const keysRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const onKeys = (event: KeyboardEvent) => {
    if (event.altKey || typing(event.target)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const order = [...dollLeft, ...dollRight, ...dollWeapons];
    if (event.key === "/" && !ctrl) {
      // On this page "/" searches appearances; Ctrl+K still opens the site search.
      event.preventDefault();
      event.stopImmediatePropagation();
      setTab("items");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-transmog-search]")?.focus());
    } else if ((event.key === "[" || event.key === "]") && !ctrl) {
      event.preventDefault();
      const index = order.indexOf(selected);
      setSelected(order[(index + (event.key === "]" ? 1 : order.length - 1)) % order.length]);
      setTab("items");
    } else if (event.key.toLowerCase() === "z" || event.code === "KeyZ") {
      if (event.shiftKey) return;
      event.preventDefault();
      undo();
    } else if ((event.key.toLowerCase() === "h" || event.code === "KeyH") && !ctrl) {
      event.preventDefault();
      toggleHidden(selected);
    }
  };
  useEffect(() => { keysRef.current = onKeys; });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keysRef.current(event);
    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, []);

  const slotButton = (slot: TransmogSlot, compact = false) => {
    const look = looks[slot];
    const hidden = state.hidden.includes(slot);
    return (
      <button key={slot} type="button" className={compact ? `${styles.slot} ${styles.slotCompact}` : styles.slot} style={look ? qualityStyle(look.quality) : undefined}
        aria-pressed={selected === slot} data-hidden={hidden || undefined} data-slot={slot} data-busy={busySlots.includes(slot) || undefined}
        data-previewing={preview?.slot === slot || undefined}
        aria-label={c.slotButton(c.slots[slot], look?.name ?? null, hidden)} title={look ? `${c.slots[slot]}: ${look.name}` : c.slots[slot]}
        onClick={() => { setSelected(slot); setTab("items"); }}>
        {look?.iconName ? <TransmogIcon name={look.iconName} size={56} eager /> : <SlotGlyph slot={slot} />}
        {hidden ? <span className={styles.slotHidden} aria-hidden="true">{c.hiddenTag}</span> : null}
      </button>
    );
  };

  const modelId = chrModelId(state.race, state.gender);
  const weight = mannequinWeight(state.race, state.gender);
  const stageLabel = c.stage([c.races[state.race], state.gender === "f" ? c.female : c.male].join(", "));
  const ready3d = stage.status === "ready";
  const poster = !edited && state.format === "4x5" ? POSTERS[`${state.race}-${state.gender}`] ?? null : null;
  const frameSettings: FrameSettings = { format: state.format, background: state.background, pose: state.pose, ...light, title: state.title, subtitle: state.subtitle, mark: state.mark, ...output };
  const downloadLabel = output.type === "image/webp" ? "WebP" : "PNG";

  return (
    <section className={styles.studio} aria-label={c.title} data-transmog-ready={ready || undefined}>
      <div className={styles.toolbar}>
        <label className={styles.toolbarField}>
          <span className={styles.visuallyHidden}>{c.race}</span>
          <AtlasSelect value={state.race} aria-label={c.race} onChange={(event) => patch({ race: event.target.value as TransmogRace })} data-transmog-race>
            {transmogRaces.map((race) => <option key={race.id} value={race.id}>{c.races[race.id]}</option>)}
          </AtlasSelect>
        </label>
        <div className={styles.segmented} role="group" aria-label={c.gender}>
          <button type="button" aria-pressed={state.gender === "m"} onClick={() => patch({ gender: "m" })} aria-label={c.male} title={c.male}>♂</button>
          <button type="button" aria-pressed={state.gender === "f"} onClick={() => patch({ gender: "f" })} aria-label={c.female} title={c.female}>♀</button>
        </div>
        <span className={styles.toolbarSpacer} />
        <AtlasButton size="sm" variant="ghost" className={styles.toolButton} icon={<Undo2 aria-hidden />} onClick={undo} disabled={!history.length} title={`${c.undo} (Z)`} aria-label={c.undo}><span className={styles.toolText}>{c.undo}</span></AtlasButton>
        <AtlasButton size="sm" variant="ghost" className={styles.toolButton} icon={<Eraser aria-hidden />} onClick={reset} title={c.reset} aria-label={c.reset}><span className={styles.toolText}>{c.reset}</span></AtlasButton>
        <AtlasButton size="sm" variant="ghost" className={styles.toolButton} icon={<Link2 aria-hidden />} onClick={() => void share()} data-transmog-share title={c.share} aria-label={c.share}><span className={styles.toolText}>{c.share}</span></AtlasButton>
        <AtlasButton size="sm" variant="primary" className={styles.downloadButton} icon={<Download aria-hidden />} onClick={() => void exportFrame()} disabled={!ready3d || exportState === "busy"}
          title={ready3d ? `${c.download(downloadLabel)} · ${format.width * Math.min(output.scale, maxScale)}×${format.height * Math.min(output.scale, maxScale)}` : c.downloadWait} data-transmog-download>
          <span className={styles.toolText}>{exportState === "busy" ? c.exporting : `${c.downloadShort} ${downloadLabel}`}</span>
        </AtlasButton>
      </div>
      <p className={styles.notice} role="status" aria-live="polite">{notice || (tab !== "frame" ? exportMessage : "")}</p>

      <div className={styles.workspace} style={{ "--stage-aspect": String(format.width / format.height) } as React.CSSProperties}>
        <div className={styles.doll}>
          <div className={styles.dollColumn}>{dollLeft.map((slot) => slotButton(slot))}</div>
          <div className={styles.stageColumn}>
            <TransmogStage ref={stageRef} requested={requested} modelId={modelId} items={items} pose={state.pose} paused={paused}
              aspect={format.width / format.height} background={backgroundDef} {...light} label={stageLabel} poster={poster} onStatus={onStatus} onBusy={onBusy}>
              <span className={styles.frameTag} aria-hidden="true">
                {c.frameLabel(c.formats[format.id].label, `${format.width}×${format.height}`)}{backgroundDef.kind === "transparent" ? ` · ${c.transparent}` : ""}
              </span>
              {state.title || state.subtitle ? (
                <span className={styles.caption} aria-hidden="true">
                  {state.subtitle ? <span className={styles.captionSubtitle}>{state.subtitle}</span> : null}
                  {state.title ? <span className={styles.captionTitle}>{state.title}</span> : null}
                </span>
              ) : null}
              {state.mark ? <span className={styles.mark} aria-hidden="true">GILDRA.NET</span> : null}
              {stage.status === "loading" ? (
                <>
                  <span className={styles.progressBar} aria-hidden="true"><i style={{ width: `${Math.max(4, stage.progress)}%` }} /></span>
                  <p className={styles.stagePill} aria-live="polite" data-stage-pill><i className={styles.spinner} aria-hidden="true" />{c.loadingPart(stage.progress, weight)}</p>
                </>
              ) : null}
              {preview && ready3d ? <p className={styles.stagePill} data-preview-pill>{c.trying(preview.look.name)}</p> : null}
              {stage.status === "idle" && manual ? (
                <div className={styles.stageOverlay} data-stage-overlay="idle">
                  <div className={styles.loadBox}>
                    <AtlasButton variant="primary" onClick={() => setRequested(true)} data-transmog-load>{c.openStudio}</AtlasButton>
                    <p className={styles.loadHint}>{c.slowNetwork(weight)}</p>
                  </div>
                </div>
              ) : null}
              {stage.status === "error" ? (
                <div className={styles.stageOverlay} data-stage-overlay="error">
                  <p className={styles.stageStatus}>{c.modelError} <AtlasButton size="sm" onClick={() => stageRef.current?.retry()}>{c.retry}</AtlasButton></p>
                </div>
              ) : null}
              {stage.status === "unsupported" ? <div className={styles.stageOverlay} data-stage-overlay="unsupported"><p className={styles.stageStatus}>{c.noWebgl}</p></div> : null}
              <div className={styles.cameraRow} role="group" aria-label={c.camera} data-camera-controls hidden={!ready3d}>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.rotate(-1)} aria-label={c.rotateLeft} title={`${c.rotateLeft} (←)`}><RotateCcw aria-hidden /></AtlasButton>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.rotate(1)} aria-label={c.rotateRight} title={`${c.rotateRight} (→)`}><RotateCw aria-hidden /></AtlasButton>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1 / 1.15)} aria-label={c.zoomIn} title={`${c.zoomIn} (+)`}><ZoomIn aria-hidden /></AtlasButton>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1.15)} aria-label={c.zoomOut} title={`${c.zoomOut} (−)`}><ZoomOut aria-hidden /></AtlasButton>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.resetCamera()} aria-label={c.resetCamera} title={`${c.resetCamera} (Home)`}><LocateFixed aria-hidden /></AtlasButton>
                <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => setPaused((value) => !value)} aria-pressed={paused} aria-label={paused ? c.play : c.pause} title={paused ? c.play : c.pause}>{paused ? <Play aria-hidden /> : <Pause aria-hidden />}</AtlasButton>
              </div>
            </TransmogStage>
            <div className={styles.slotStrip} role="group" aria-label={c.tabs.items}>{transmogSlots.map((slot) => slotButton(slot, true))}</div>
          </div>
          <div className={styles.dollColumn}>
            {dollRight.map((slot) => slotButton(slot))}
            <span className={styles.dollGap} aria-hidden="true" />
            <div className={styles.weaponGroup} role="group" aria-label={c.weapons}>{dollWeapons.map((slot) => slotButton(slot))}</div>
          </div>
        </div>

        <div className={styles.panel}>
          <AtlasTabs label={c.title} value={tab} onChange={setTab} className={styles.tabs} tabs={[
            { id: "items", label: c.tabs.items, content: <ItemPicker lang={lang} slot={selected} current={looks[selected]} hidden={state.hidden.includes(selected)}
              onPick={(look) => pick(selected, look)} onToggleHidden={() => toggleHidden(selected)} onRemove={() => pick(selected, undefined)}
              onPreview={(look) => {
                if (!look) { setPreview((current) => (current ? null : current)); return; }
                if (!ready3d || looks[selected]?.appearanceId === look.appearanceId) return;
                markBusy([selected]);
                setPreview({ slot: selected, look });
              }} /> },
            { id: "sets", label: c.tabs.sets, content: <SetPicker lang={lang} wearing={wearingSet} onWear={(entry) => void wear(entry)} /> },
            { id: "frame", label: c.tabs.frame, content: <TransmogFramePanel lang={lang} settings={frameSettings} maxScale={maxScale}
              canExport={ready3d} exportState={exportState} exportMessage={ready3d ? exportMessage : c.downloadWait}
              onExport={() => void exportFrame()}
              onChange={(change) => {
                const { brightness, contrast, shadow, scale, type, ...rest } = change;
                if (brightness !== undefined || contrast !== undefined || shadow !== undefined) setLight((previous) => ({ brightness: brightness ?? previous.brightness, contrast: contrast ?? previous.contrast, shadow: shadow ?? previous.shadow }));
                if (scale !== undefined || type !== undefined) setOutput((previous) => ({ scale: scale ?? previous.scale, type: type ?? previous.type }));
                if (Object.keys(rest).length) patch(rest);
              }} /> },
          ]} />
        </div>
      </div>
      <p className={styles.keys}>{c.keys}</p>
      <details className={styles.sources}>
        <summary>{c.sources}</summary>
        <p>{c.sourcesBody}</p>
      </details>
    </section>
  );
}
