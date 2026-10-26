"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Link2, LocateFixed, Pause, Play, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import {
  background as backgroundOf, chrModelId, dollLeft, dollRight, dollWeapons, frameFormat, transmogRaces, transmogSlots,
  type TransmogAppearance, type TransmogGender, type TransmogRace, type TransmogSetDetail, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { defaultTransmogState, parseTransmogState, serializeTransmogState, type TransmogState } from "@/lib/wow/transmog/state";
import { canvasBlob, composeFrame, downloadBlob } from "@/lib/wow/transmog/compose";
import { ItemPicker, SetPicker, qualityStyle } from "./TransmogPicker";
import { TransmogFramePanel, type FrameSettings } from "./TransmogFramePanel";
import { TransmogStage, type StageHandle, type StageStatus } from "./TransmogStage";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
type Looks = Partial<Record<TransmogSlot, TransmogAppearance>>;
type Snapshot = { looks: Looks; hidden: TransmogSlot[] };

/** First outfit when the link carries none: a full plate set that shows every slot. */
const STARTER_SET = 3871;
const apiLocale = (lang: Lang) => (lang === "ru" ? "ru_RU" : "en_US");

/** Approximate first download of a mannequin (skeleton + model + textures, gzip), MB. */
function mannequinWeight(race: TransmogRace, gender: TransmogGender) {
  if (race === "troll") return gender === "m" ? 27 : 22;
  if (race === "goblin" && gender === "f") return 23;
  return 18;
}

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

export function TransmogStudio({ lang }: { lang: Lang }) {
  const c = transmogCopy[lang];
  const stageRef = useRef<StageHandle>(null);
  const [state, setState] = useState<TransmogState>(defaultTransmogState);
  const [looks, setLooks] = useState<Looks>({});
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<TransmogSlot>("head");
  const [tab, setTab] = useState("items");
  const [wearingSet, setWearingSet] = useState<number | null>(null);
  const [requested, setRequested] = useState(false);
  const [stage, setStage] = useState<{ status: StageStatus; progress: number }>({ status: "idle", progress: 0 });
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const [exportState, setExportState] = useState<"idle" | "busy">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [light, setLight] = useState({ brightness: 1, contrast: 1, shadow: 0.6 });
  const [output, setOutput] = useState<{ scale: 1 | 2; type: FrameSettings["type"] }>({ scale: 1, type: "image/png" });
  const [maxScale, setMaxScale] = useState<1 | 2>(1);
  const [ready, setReady] = useState(false);

  // Restore a share link, or dress the mannequin in the starter set.
  useEffect(() => {
    const parsed = parseTransmogState(new URLSearchParams(window.location.search));
    setState(parsed);
    setMaxScale(window.matchMedia("(pointer: coarse)").matches ? 1 : 2);
    const ids = transmogSlots.map((slot) => parsed.looks[slot]).filter((id): id is number => Boolean(id));
    const controller = new AbortController();
    const restore = async () => {
      if (ids.length) {
        const response = await fetch(`/api/wow/transmog/appearances?ids=${ids.join(",")}&locale=${apiLocale(lang)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const { data } = await response.json() as { data: TransmogAppearance[] };
        const byId = new Map(data.map((entry) => [entry.modifiedAppearanceId, entry]));
        const restored: Looks = {};
        for (const slot of transmogSlots) {
          const entry = parsed.looks[slot] ? byId.get(parsed.looks[slot]!) : undefined;
          if (entry) restored[slot] = entry;
        }
        setLooks(restored);
      } else {
        const response = await fetch(`/api/wow/transmog/sets/${STARTER_SET}?locale=${apiLocale(lang)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const detail = await response.json() as TransmogSetDetail;
        setLooks(wearSet({}, detail));
        setWearingSet(detail.id);
      }
    };
    restore().catch(() => { if (!controller.signal.aborted) setNotice(c.error); }).finally(() => setReady(true));
    return () => controller.abort();
  }, [c.error, lang]);

  // Keep the address bar a share link of the current outfit and frame.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const query = serializeTransmogState({ ...state, looks: Object.fromEntries(transmogSlots.filter((slot) => looks[slot]).map((slot) => [slot, looks[slot]!.modifiedAppearanceId])) });
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [looks, ready, state]);

  const remember = useCallback(() => setHistory((previous) => [...previous.slice(-29), { looks, hidden: state.hidden }]), [looks, state.hidden]);
  const patch = useCallback((next: Partial<TransmogState>) => setState((previous) => ({ ...previous, ...next })), []);

  const pick = (slot: TransmogSlot, look: TransmogAppearance | undefined) => {
    remember();
    setWearingSet(null);
    setLooks((previous) => {
      const next = { ...previous };
      if (look) next[slot] = look;
      else delete next[slot];
      return next;
    });
  };
  const toggleHidden = (slot: TransmogSlot) => {
    remember();
    patch({ hidden: state.hidden.includes(slot) ? state.hidden.filter((entry) => entry !== slot) : [...state.hidden, slot] });
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory(history.slice(0, -1));
    setLooks(last.looks);
    patch({ hidden: last.hidden });
  };
  const reset = () => {
    remember();
    setLooks({});
    setWearingSet(null);
    patch({ hidden: [] });
  };
  const wear = async (summary: TransmogSetSummary) => {
    try {
      const response = await fetch(`/api/wow/transmog/sets/${summary.id}?locale=${apiLocale(lang)}`);
      if (!response.ok) throw new Error(String(response.status));
      const detail = await response.json() as TransmogSetDetail;
      remember();
      setLooks((previous) => wearSet(previous, detail));
      setWearingSet(detail.id);
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
      const look = looks[slot];
      if (look && !state.hidden.includes(slot)) map.set(viewerSlot(slot, look), look.displayId);
    }
    return map;
  }, [looks, state.hidden]);

  const format = frameFormat(state.format);
  const backgroundDef = backgroundOf(state.background);
  const onStatus = useCallback((status: StageStatus, progress: number) => setStage({ status, progress }), []);

  const exportFrame = async () => {
    const handle = stageRef.current;
    if (!handle) return;
    const scale = Math.min(output.scale, maxScale);
    const width = format.width * scale, height = format.height * scale;
    setExportState("busy");
    setExportMessage("");
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

  const slotButton = (slot: TransmogSlot, compact = false) => {
    const look = looks[slot];
    const hidden = state.hidden.includes(slot);
    return (
      <button key={slot} type="button" className={compact ? `${styles.slot} ${styles.slotCompact}` : styles.slot} style={look ? qualityStyle(look.quality) : undefined}
        aria-pressed={selected === slot} data-hidden={hidden || undefined} data-slot={slot}
        aria-label={c.slotButton(c.slots[slot], look?.name ?? null, hidden)} title={look ? `${c.slots[slot]}: ${look.name}` : c.slots[slot]}
        onClick={() => { setSelected(slot); setTab("items"); }}>
        {look?.iconName ? <TransmogIcon name={look.iconName} size={56} /> : <span className={styles.slotEmpty} aria-hidden="true">{c.slotShort[slot] ?? c.slots[slot]}</span>}
        {hidden ? <span className={styles.slotHidden} aria-hidden="true">{c.hiddenTag}</span> : null}
      </button>
    );
  };

  const modelId = chrModelId(state.race, state.gender);
  const stageLabel = c.stage([c.races[state.race], state.gender === "f" ? c.female : c.male].join(", "));
  const showStageControls = stage.status === "ready";
  const frameSettings: FrameSettings = { format: state.format, background: state.background, pose: state.pose, ...light, title: state.title, subtitle: state.subtitle, mark: state.mark, ...output };

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
        <AtlasButton size="sm" variant="ghost" icon={<Undo2 aria-hidden />} onClick={undo} disabled={!history.length}>{c.undo}</AtlasButton>
        <AtlasButton size="sm" variant="ghost" icon={<Eraser aria-hidden />} onClick={reset}>{c.reset}</AtlasButton>
        <AtlasButton size="sm" icon={<Link2 aria-hidden />} onClick={() => void share()} data-transmog-share>{c.share}</AtlasButton>
      </div>
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

      <div className={styles.workspace}>
        <div className={styles.doll}>
          <div className={styles.dollColumn}>{dollLeft.map((slot) => slotButton(slot))}</div>
          <div className={styles.stageColumn}>
            <TransmogStage ref={stageRef} requested={requested} modelId={modelId} items={items} pose={state.pose} paused={paused}
              aspect={format.width / format.height} background={backgroundDef} {...light} label={stageLabel} onStatus={onStatus}>
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
              {stage.status !== "ready" ? (
                <div className={styles.stageOverlay} data-stage-overlay={stage.status}>
                  {stage.status === "idle" ? (
                    <div className={styles.loadBox}>
                      <AtlasButton variant="primary" onClick={() => setRequested(true)} data-transmog-load>{c.openStudio}</AtlasButton>
                      <p className={styles.loadHint}>{c.openHint(mannequinWeight(state.race, state.gender))}</p>
                    </div>
                  ) : null}
                  {stage.status === "loading" ? (
                    <p className={styles.stageStatus} aria-live="polite">
                      <i className={styles.spinner} aria-hidden="true" />{c.loadingModel}{stage.progress > 0 && stage.progress < 100 ? ` · ${stage.progress}%` : "…"}
                    </p>
                  ) : null}
                  {stage.status === "error" ? (
                    <p className={styles.stageStatus}>{c.modelError} <AtlasButton size="sm" onClick={() => stageRef.current?.retry()}>{c.retry}</AtlasButton></p>
                  ) : null}
                  {stage.status === "unsupported" ? <p className={styles.stageStatus}>{c.noWebgl}</p> : null}
                </div>
              ) : null}
            </TransmogStage>
            <div className={styles.slotStrip} role="group" aria-label={c.tabs.items}>{transmogSlots.map((slot) => slotButton(slot, true))}</div>
            <div className={styles.cameraRow} data-camera-controls hidden={!showStageControls}>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.rotate(-1)} aria-label={c.rotateLeft} title={c.rotateLeft}><RotateCcw aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.rotate(1)} aria-label={c.rotateRight} title={c.rotateRight}><RotateCw aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1 / 1.15)} aria-label={c.zoomIn} title={c.zoomIn}><ZoomIn aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1.15)} aria-label={c.zoomOut} title={c.zoomOut}><ZoomOut aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.resetCamera()} aria-label={c.resetCamera} title={c.resetCamera}><LocateFixed aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => setPaused((value) => !value)} aria-pressed={paused} aria-label={paused ? c.play : c.pause} title={paused ? c.play : c.pause}>{paused ? <Play aria-hidden /> : <Pause aria-hidden />}</AtlasButton>
            </div>
            <div className={styles.weaponRow}>{dollWeapons.map((slot) => slotButton(slot))}</div>
          </div>
          <div className={styles.dollColumn}>{dollRight.map((slot) => slotButton(slot))}</div>
        </div>

        <div className={styles.panel}>
          <AtlasTabs label={c.title} value={tab} onChange={setTab} className={styles.tabs} tabs={[
            { id: "items", label: c.tabs.items, content: <ItemPicker lang={lang} slot={selected} current={looks[selected]} hidden={state.hidden.includes(selected)}
              onPick={(look) => pick(selected, look)} onToggleHidden={() => toggleHidden(selected)} onRemove={() => pick(selected, undefined)} /> },
            { id: "sets", label: c.tabs.sets, content: <SetPicker lang={lang} wearing={wearingSet} onWear={(entry) => void wear(entry)} /> },
            { id: "frame", label: c.tabs.frame, content: <TransmogFramePanel lang={lang} settings={frameSettings} maxScale={maxScale}
              canExport={stage.status === "ready"} exportState={exportState} exportMessage={stage.status === "ready" ? exportMessage : c.openHint(mannequinWeight(state.race, state.gender))}
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
      <details className={styles.sources}>
        <summary>{c.sources}</summary>
        <p>{c.sourcesBody}</p>
      </details>
    </section>
  );
}

