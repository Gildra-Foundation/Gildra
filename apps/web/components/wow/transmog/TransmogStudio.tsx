"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Dices, Download, Eraser, EyeOff, Link2, LocateFixed, Pause, Play, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import {
  armoredSlots, background as backgroundOf, chrModelId, classIds, dollLeft, dollRight, dollWeapons, frameFormat, singleBody, transmogRaces, transmogSlots,
  type TransmogAppearance, type TransmogClass, type TransmogGender, type TransmogRace, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { defaultTransmogState, hasOwnLooks, parseTransmogState, serializeTransmogState, type TransmogState } from "@/lib/wow/transmog/state";
import {
  lookIds, offsetCursor, outfitArmor, pushHistory, randomOffset, randomSlots, toggleHidden, wearLook, wearSet, type Looks, type Snapshot,
} from "@/lib/wow/transmog/outfit";
import { STARTER_SET_ID, starterSet } from "@/lib/wow/transmog/starter";
import { canvasBlob, composeFrame, downloadBlob } from "@/lib/wow/transmog/compose";
import {
  ItemPicker, SetPicker, apiLocale, appearancesUrl, cachedJson, defaultArmor, loadSetDetail, prefetchJson, qualityStyle, setsUrl, type Page,
} from "./TransmogPicker";
import { TransmogFramePanel, type FrameSettings } from "./TransmogFramePanel";
import { TransmogStage, type StageHandle, type StageStatus } from "./TransmogStage";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import { SlotGlyph } from "./TransmogSlotGlyph";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
/** The studio wears the slim Library kit: gilded wardrobe plaque and buttons (see transmog.module.css). */
const KIT = "library";

/** Approximate first download of a mannequin (skeleton + model + textures, brotli), MB; shown only before a manual start. */
function mannequinWeight(race: TransmogRace, gender: TransmogGender) {
  if (race === "troll" || race === "zandalari-troll") return gender === "m" ? 21 : 17;
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

/** 3D starts by itself unless the visitor saves data or is on a 2G/3G link. */
function autoLoad() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !connection?.saveData && !/(^|-)(2g|3g)$/.test(connection?.effectiveType ?? "");
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const phone = () => window.matchMedia("(max-width: 700px)").matches;
const lessMotion = () => document.documentElement.dataset.motion === "reduced" || document.documentElement.dataset.uiMotion === "reduce"
  || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One of the studio's glass icon tools: the label is the tooltip and the accessible name. */
function ToolButton({ label, icon, ...rest }: { label: string; icon: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string>) {
  return <AtlasButton variant="ghost" className={styles.tool} icon={icon} title={label} {...rest}><span className={styles.visuallyHidden}>{label}</span></AtlasButton>;
}

export function TransmogStudio({ lang, hero }: { lang: Lang; hero: ReactNode }) {
  const c = transmogCopy[lang];
  const sheetId = useId();
  const stageRef = useRef<StageHandle>(null);
  const stageColumnRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TransmogState>(defaultTransmogState);
  const [looks, setLooks] = useState<Looks>(() => wearSet({}, starterSet[lang]));
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<TransmogSlot>("head");
  const [tab, setTab] = useState("items");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wearingSet, setWearingSet] = useState<number | null>(STARTER_SET_ID);
  const [edited, setEdited] = useState(false);
  const [requested, setRequested] = useState(false);
  const [manual, setManual] = useState(false);
  const [stage, setStage] = useState<{ status: StageStatus; progress: number }>({ status: "idle", progress: 0 });
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const [rolling, setRolling] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "busy">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [light, setLight] = useState({ brightness: 1, contrast: 1, shadow: 0.6 });
  const [output, setOutput] = useState<{ scale: 1 | 2; type: FrameSettings["type"] }>({ scale: 1, type: "image/png" });
  const [maxScale, setMaxScale] = useState<1 | 2>(1);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<{ slot: TransmogSlot; look: TransmogAppearance } | null>(null);
  const [busySlots, setBusySlots] = useState<TransmogSlot[]>([]);
  const pendingRef = useRef<TransmogSlot[]>([]);
  const [footerInView, setFooterInView] = useState(false);

  // Phone: the folded sheet steps aside while the site footer is on screen, so it never covers the legal line.
  useEffect(() => {
    const footer = [...document.querySelectorAll("footer")].pop();
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setFooterInView(entries.some((entry) => entry.isIntersecting)));
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  // Restore a share link (the starter outfit is already on the doll from the first HTML).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseTransmogState(params);
    setState(parsed);
    setMaxScale(window.matchMedia("(pointer: coarse)").matches ? 1 : 2);
    if (autoLoad()) setRequested(true);
    else setManual(true);
    const ids = transmogSlots.map((slot) => parsed.looks[slot]).filter((id): id is number => Boolean(id));
    if (!ids.length) {
      // `s=` with no looks: the visitor shared an empty mannequin.
      if (hasOwnLooks(params)) { setLooks({}); setWearingSet(null); setEdited(true); }
      setReady(true);
      return;
    }
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
      const query = serializeTransmogState({ ...state, looks: edited ? lookIds(looks) : {} }, edited);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [edited, looks, ready, state]);

  // Once 3D is ready, warm the first page of every slot and of the sets in idle time.
  useEffect(() => {
    if (stage.status !== "ready") return;
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    idle(() => {
      for (const slot of transmogSlots) prefetchJson(appearancesUrl(lang, slot, "", defaultArmor(slot, looks[slot], state.cls)));
      prefetchJson(setsUrl(lang, "", 0));
    });
  }, [lang, stage.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const remember = useCallback(() => setHistory((previous) => pushHistory(previous, { looks, hidden: state.hidden })), [looks, state.hidden]);
  const patch = useCallback((next: Partial<TransmogState>) => setState((previous) => ({ ...previous, ...next })), []);
  const markBusy = (slots: TransmogSlot[]) => { pendingRef.current = slots; };

  const pick = (slot: TransmogSlot, look: TransmogAppearance | undefined) => {
    remember();
    setWearingSet(null);
    setEdited(true);
    setPreview(null);
    if (look) markBusy([slot]);
    setLooks((previous) => wearLook(previous, slot, look));
  };
  const hide = (slot: TransmogSlot) => {
    remember();
    setEdited(true);
    patch({ hidden: toggleHidden(state.hidden, slot) });
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
  /** One random look per armor slot, in the armor of the class (or of the outfit). */
  const randomize = async () => {
    if (rolling) return;
    setRolling(true);
    const armor = outfitArmor(state.cls, looks);
    try {
      const picks = await Promise.all(randomSlots.map(async (slot) => {
        const url = appearancesUrl(lang, slot, "", armoredSlots.has(slot) ? armor : "all");
        const first = await cachedJson<Page<TransmogAppearance>>(url);
        if (!first.total) return null;
        const offset = randomOffset(first.total);
        const page = offset < first.data.length ? { data: first.data.slice(offset) } : await cachedJson<Page<TransmogAppearance>>(`${url}&cursor=${offsetCursor(offset)}`);
        return page.data[0] ? [slot, page.data[0]] as const : null;
      }));
      const chosen = picks.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      if (!chosen.length) throw new Error("nothing to wear");
      remember();
      markBusy(chosen.map(([slot]) => slot));
      setLooks((previous) => ({ ...previous, ...Object.fromEntries(chosen) }));
      setWearingSet(null);
      setEdited(true);
      setNotice("");
    } catch {
      setNotice(c.error);
    } finally {
      setRolling(false);
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

  /** Phone: the picker is a bottom sheet; opening it brings the stage to the top of the screen. */
  const openSheet = () => {
    setSheetOpen(true);
    if (phone()) window.requestAnimationFrame(() => stageColumnRef.current?.scrollIntoView({ block: "start", behavior: lessMotion() ? "auto" : "smooth" }));
  };
  const chooseSlot = (slot: TransmogSlot) => {
    setSelected(slot);
    setTab("items");
    openSheet();
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
      const saved = c.exported(`${width}×${height}`);
      setExportMessage(output.type === "image/webp" && extension !== "webp" ? `${saved}. ${c.webpFallback}` : saved);
    } catch {
      setExportMessage(c.exportFailed);
    } finally {
      setExportState("idle");
    }
  };

  // Keyboard: / search, [ ] previous/next slot, Z (or Ctrl+Z) undo, H hide slot, Esc folds the phone sheet.
  const keysRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const onKeys = (event: KeyboardEvent) => {
    if (event.key === "Escape" && sheetOpen && phone()) { setSheetOpen(false); return; }
    if (event.altKey || typing(event.target)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const order = [...dollLeft, ...dollRight, ...dollWeapons];
    if (event.key === "/" && !ctrl) {
      // On this page "/" searches appearances; Ctrl+K still opens the site search.
      event.preventDefault();
      event.stopImmediatePropagation();
      setTab("items");
      openSheet();
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
      hide(selected);
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
        aria-pressed={selected === slot} data-hidden={hidden || undefined} data-empty={look ? undefined : ""} data-slot={slot} data-busy={busySlots.includes(slot) || undefined}
        data-previewing={preview?.slot === slot || undefined} aria-controls={sheetId}
        aria-label={c.slotButton(c.slots[slot], look?.name ?? null, hidden)} title={look ? `${c.slots[slot]}: ${look.name}` : c.slots[slot]}
        onClick={() => chooseSlot(slot)}>
        {look ? <TransmogIcon name={look.iconName} itemId={look.itemId} size={56} eager fallback={<SlotGlyph slot={slot} />} /> : <SlotGlyph slot={slot} />}
        {hidden ? <span className={styles.slotHidden} aria-hidden="true"><EyeOff /></span> : null}
      </button>
    );
  };

  const modelId = chrModelId(state.race, state.gender);
  const oneBody = singleBody(state.race);
  const weight = mannequinWeight(state.race, state.gender);
  const stageLabel = c.stage([c.races[state.race], oneBody ? null : state.gender === "f" ? c.female : c.male, state.cls ? c.classes[state.cls] : null].filter(Boolean).join(", "));
  const ready3d = stage.status === "ready";
  const poster = !edited && state.format === "4x5" ? POSTERS[`${state.race}-${state.gender}`] ?? null : null;
  const frameSettings: FrameSettings = { format: state.format, background: state.background, pose: state.pose, ...light, title: state.title, subtitle: state.subtitle, mark: state.mark, ...output };
  const downloadLabel = output.type === "image/webp" ? "WebP" : "PNG";

  // The scene of the frame continues, dimmed, around the stage: the wardrobe reads as one room.
  const surround: CSSProperties = backgroundDef.kind === "scene" ? { "--doll-surround": `url(${backgroundDef.src})`, "--doll-surround-position": backgroundDef.position } as CSSProperties
    : backgroundDef.kind === "color" ? { "--doll-surround": backgroundDef.color } as CSSProperties
      : backgroundDef.kind === "gradient" ? { "--doll-surround": `linear-gradient(${backgroundDef.angle}deg, ${backgroundDef.stops[0]}, ${backgroundDef.stops[1]})` } as CSSProperties
        : {};
  return (
    <section className={styles.studio} aria-label={c.title} data-transmog-ready={ready || undefined} data-sheet-open={sheetOpen || undefined}
      data-footer-in-view={footerInView || undefined}>
      <div className={styles.head}>
        {hero}
        <div className={styles.toolbar}>
          <div className={styles.identity}>
            <label className={styles.toolbarField} data-field="race">
              <span className={styles.visuallyHidden}>{c.race}</span>
              <AtlasSelect value={state.race} aria-label={c.race} onChange={(event) => patch({ race: event.target.value as TransmogRace })} data-transmog-race>
                {transmogRaces.map((race) => <option key={race.id} value={race.id}>{c.races[race.id]}</option>)}
              </AtlasSelect>
            </label>
            {oneBody ? null : (
              <div className={styles.segmented} role="group" aria-label={c.gender}>
                <button type="button" aria-pressed={state.gender === "m"} onClick={() => patch({ gender: "m" })} aria-label={c.male} title={c.male}>♂</button>
                <button type="button" aria-pressed={state.gender === "f"} onClick={() => patch({ gender: "f" })} aria-label={c.female} title={c.female}>♀</button>
              </div>
            )}
            <label className={styles.toolbarField} data-field="class">
              <span className={styles.visuallyHidden}>{c.cls}</span>
              <AtlasSelect value={state.cls} aria-label={c.cls} onChange={(event) => patch({ cls: event.target.value as TransmogClass | "" })} data-transmog-class>
                <option value="">{c.anyClass}</option>
                {classIds.map((entry) => <option key={entry.slug} value={entry.slug}>{c.classes[entry.slug]}</option>)}
              </AtlasSelect>
            </label>
          </div>
          <div className={styles.actions}>
            <div className={styles.tools}>
              <ToolButton label={`${c.undo} (Z)`} icon={<Undo2 aria-hidden />} onClick={undo} disabled={!history.length} aria-keyshortcuts="Z" />
              <ToolButton label={c.randomize} icon={<Dices aria-hidden />} onClick={() => void randomize()} disabled={rolling} aria-busy={rolling || undefined} data-transmog-random="" />
              <ToolButton label={c.reset} icon={<Eraser aria-hidden />} onClick={reset} />
              <ToolButton label={c.share} icon={<Link2 aria-hidden />} onClick={() => void share()} data-transmog-share="" />
            </div>
            <AtlasButton variant="primary" className={styles.download} icon={<Download aria-hidden />} onClick={() => void exportFrame()} disabled={!ready3d || exportState === "busy"}
              aria-busy={exportState === "busy" || undefined}
              title={ready3d ? `${c.download(downloadLabel)} · ${format.width * Math.min(output.scale, maxScale)}×${format.height * Math.min(output.scale, maxScale)}` : c.downloadWait} data-transmog-download>
              {c.downloadShort}<span className={styles.actionFormat}> {downloadLabel}</span>
            </AtlasButton>
          </div>
        </div>
      </div>
      <p className={styles.notice} role="status" aria-live="polite">{notice || exportMessage}</p>

      <MaterialPlaque kit={KIT} className={styles.wardrobe} style={{ "--stage-aspect": String(format.width / format.height) } as CSSProperties}>
        <div className={styles.dollPane} style={surround} data-surround={backgroundDef.kind}>
          <div className={styles.doll}>
            <div className={styles.dollColumn}>{dollLeft.map((slot) => slotButton(slot))}</div>
            <div className={styles.stageColumn} ref={stageColumnRef}>
              <TransmogStage ref={stageRef} requested={requested} modelId={modelId} items={items} pose={state.pose} paused={paused}
                aspect={format.width / format.height} background={backgroundDef} {...light} label={stageLabel} poster={poster} onStatus={onStatus} onBusy={onBusy}>
                {state.title || state.subtitle ? (
                  <span className={styles.caption} aria-hidden="true">
                    {state.subtitle ? <span className={styles.captionSubtitle}>{state.subtitle}</span> : null}
                    {state.title ? <span className={styles.captionTitle}>{state.title}</span> : null}
                  </span>
                ) : null}
                {state.mark ? <span className={styles.mark} aria-hidden="true">GILDRA.NET</span> : null}
                {stage.status === "loading" ? (
                  <div className={styles.loader} data-over-poster={poster ? "" : undefined} role="status" data-stage-pill>
                    <span className={styles.loaderRing} style={{ "--progress": `${Math.max(3, stage.progress)}%` } as CSSProperties} aria-hidden="true" />
                    <span className={styles.loaderText}>{c.loadingPart(stage.progress)}</span>
                  </div>
                ) : null}
                {preview && ready3d ? <p className={styles.stagePill} data-preview-pill>{c.trying(preview.look.name)}</p> : null}
                {stage.status === "idle" && manual ? (
                  <div className={styles.stageOverlay} data-stage-overlay="idle">
                    <div className={styles.loadBox}>
                      <AtlasButton variant="primary" onClick={() => setRequested(true)} data-transmog-load>{c.openStudio}</AtlasButton>
                      <p className={styles.loadHint}>{c.weight(weight)}</p>
                    </div>
                  </div>
                ) : null}
                {stage.status === "error" ? (
                  <div className={styles.stageOverlay} data-stage-overlay="error">
                    <p className={styles.stageStatus}>{c.modelError} <AtlasButton size="sm" onClick={() => stageRef.current?.retry()}>{c.retry}</AtlasButton></p>
                  </div>
                ) : null}
                {stage.status === "unsupported" ? <div className={styles.stageOverlay} data-stage-overlay="unsupported"><p className={styles.stageStatus}>{c.noWebgl}</p></div> : null}
              </TransmogStage>
            </div>
            <div className={styles.dollColumn}>{dollRight.map((slot) => slotButton(slot))}</div>
          </div>
          <div className={styles.stageBar}>
            <div className={styles.cameraRow} data-camera="zoom" role="group" aria-label={c.camera} data-camera-controls hidden={!ready3d}>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1 / 1.15)} aria-label={c.zoomIn} title={`${c.zoomIn} (+)`}><ZoomIn aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.zoom(1.15)} aria-label={c.zoomOut} title={`${c.zoomOut} (−)`}><ZoomOut aria-hidden /></AtlasButton>
            </div>
            <div className={styles.weaponRow} role="group" aria-label={c.weapons}>{dollWeapons.map((slot) => slotButton(slot))}</div>
            <div className={styles.slotStrip} role="group" aria-label={c.tabs.items}>{transmogSlots.map((slot) => slotButton(slot, true))}</div>
            <div className={styles.cameraRow} data-camera="view" role="group" aria-label={c.camera} hidden={!ready3d}>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => stageRef.current?.resetCamera()} aria-label={c.resetCamera} title={`${c.resetCamera} (Home)`}><LocateFixed aria-hidden /></AtlasButton>
              <AtlasButton size="sm" variant="ghost" className={styles.iconButton} onClick={() => setPaused((value) => !value)} aria-pressed={paused} aria-label={paused ? c.play : c.pause} title={paused ? c.play : c.pause}>{paused ? <Play aria-hidden /> : <Pause aria-hidden />}</AtlasButton>
            </div>
          </div>
        </div>

        <div className={styles.panel} id={sheetId} data-sheet={sheetOpen ? "open" : "closed"}
          onFocusCapture={(event) => { if (!sheetOpen && phone() && !(event.target as HTMLElement).closest("[data-sheet-handle], [role=tab]")) openSheet(); }}>
          <button type="button" className={styles.sheetHandle} data-sheet-handle aria-expanded={sheetOpen} aria-controls={sheetId} onClick={() => (sheetOpen ? setSheetOpen(false) : openSheet())}>
            <span className={styles.grabber} aria-hidden="true" />
            <span className={styles.visuallyHidden}>{sheetOpen ? c.closePicker : c.openPicker}</span>
          </button>
          <AtlasTabs label={c.title} value={tab} onChange={(id) => { setTab(id); openSheet(); }} className={styles.tabs} tabs={[
            { id: "items", label: c.tabs.items, content: <ItemPicker lang={lang} slot={selected} cls={state.cls} current={looks[selected]} hidden={state.hidden.includes(selected)}
              onPick={(look) => pick(selected, look)} onToggleHidden={() => hide(selected)} onRemove={() => pick(selected, undefined)}
              onPreview={(look) => {
                if (!look) { setPreview((current) => (current ? null : current)); return; }
                if (!ready3d || looks[selected]?.appearanceId === look.appearanceId) return;
                markBusy([selected]);
                setPreview({ slot: selected, look });
              }} /> },
            { id: "sets", label: c.tabs.sets, content: <SetPicker lang={lang} cls={state.cls} wearing={wearingSet} onWear={(entry) => void wear(entry)} /> },
            { id: "frame", label: c.tabs.frame, content: <TransmogFramePanel lang={lang} settings={frameSettings} maxScale={maxScale}
              onChange={(change) => {
                const { brightness, contrast, shadow, scale, type, ...rest } = change;
                if (brightness !== undefined || contrast !== undefined || shadow !== undefined) setLight((previous) => ({ brightness: brightness ?? previous.brightness, contrast: contrast ?? previous.contrast, shadow: shadow ?? previous.shadow }));
                if (scale !== undefined || type !== undefined) setOutput((previous) => ({ scale: scale ?? previous.scale, type: type ?? previous.type }));
                if (Object.keys(rest).length) patch(rest);
              }} /> },
          ]} />
        </div>
      </MaterialPlaque>
    </section>
  );
}
