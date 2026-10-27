"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import {
  createZamViewer, loadZamViewerScript, prepareZamViewer, waitForZamQuiet, waitForZamViewer, webglAvailable, ZAM_CONTENT_PATH, ZAM_MODEL_TYPE, type WowViewer,
} from "@/lib/wow/zamModelViewer";
import type { BackgroundDef } from "@/lib/wow/transmog/model";
import { captureViewer, clearViewerSlots, pauseViewer, resizeViewer, setViewerBackground, setViewerItems, setViewerPose, type ViewerItem } from "@/lib/wow/transmog/viewer";
import { stageBackgroundURL } from "@/lib/wow/transmog/compose";
import styles from "./transmog.module.css";

export type StageStatus = "idle" | "loading" | "ready" | "error" | "unsupported";
export type StageHandle = {
  capture: (width: number, height: number) => Promise<HTMLImageElement>;
  rotate: (direction: 1 | -1) => void;
  zoom: (factor: number) => void;
  resetCamera: () => void;
  retry: () => void;
};

type Customization = { Options: Array<{ Id: number; Choices: Array<{ Id: number }> }> };
type Camera = { distance: number; zenith: number; azimuth: number };

const ROTATE_STEP = Math.PI / 8;
const ZOOM_STEP = 1.15;

async function defaultCustomization(modelId: number) {
  const response = await fetch(`${ZAM_CONTENT_PATH}meta/charactercustomization/${modelId}.json`);
  if (!response.ok) throw new Error("character customization unavailable");
  const customization = await response.json() as Customization;
  return customization.Options.filter((option) => option.Choices.length > 0).map((option) => ({ optionId: option.Id, choiceId: option.Choices[0].Id }));
}

function reducedMotion() {
  return document.documentElement.dataset.motion === "reduced" || document.documentElement.dataset.uiMotion === "reduce"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
  ref?: Ref<StageHandle>;
  requested: boolean;
  modelId: number;
  /** Desired viewer slot → ItemDisplayInfoID; slots not listed are bare. */
  items: Map<number, number>;
  pose: string;
  paused: boolean;
  aspect: number;
  background: BackgroundDef;
  brightness: number;
  contrast: number;
  shadow: number;
  label: string;
  /** Picture of this outfit shown until the 3D model is ready (same camera and frame). */
  poster?: string | null;
  onStatus: (status: StageStatus, progress: number) => void;
  /** True while swapped items are still downloading, false once the model is quiet. */
  onBusy?: (busy: boolean) => void;
  children?: React.ReactNode;
};

/**
 * The 3D stage: the Wowhead character viewer on a preview of the export
 * background. The mannequin loads once per race/body; items, pose and frame
 * changes are applied to the live model without reloading it.
 */
export function TransmogStage({ ref, requested, modelId, items, pose, paused, aspect, background, brightness, contrast, shadow, label, poster, onStatus, onBusy, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WowViewer | null>(null);
  const appliedRef = useRef<Map<number, number>>(new Map());
  const homeRef = useRef<Camera | null>(null);
  const itemsRef = useRef(items);
  const capturingRef = useRef(false);
  const [status, setStatus] = useState<StageStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef(0);
  const onBusyRef = useRef(onBusy);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { onBusyRef.current = onBusy; }, [onBusy]);

  const report = useCallback((next: StageStatus, progress = 0) => {
    setStatus(next);
    onStatus(next, progress);
  }, [onStatus]);

  // Load (or reload on race/body change) the mannequin with the current items.
  useEffect(() => {
    if (!requested) return;
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) {
      report("unsupported");
      return;
    }
    let cancelled = false;
    host.replaceChildren();
    report("loading");
    const boot = async () => {
      await prepareZamViewer();
      const charOptions = await defaultCustomization(modelId);
      await loadZamViewerScript();
      if (cancelled || !hostRef.current) return;
      const initial = [...itemsRef.current.entries()];
      const viewer = createZamViewer(hostRef.current, {
        aspect: Math.max(0.2, host.clientWidth / Math.max(1, host.clientHeight)),
        hd: true,
        models: { id: modelId, type: ZAM_MODEL_TYPE.character },
        charCustomization: { options: charOptions },
        items: initial.map(([slot, display]) => [slot, display]),
        // Zoom with the wheel only while the stage has focus or with Ctrl.
        wheelEventValidation: (event: { originalEvent?: WheelEvent }) =>
          Boolean(event.originalEvent?.ctrlKey || event.originalEvent?.metaKey || rootRef.current?.contains(document.activeElement)),
      });
      viewerRef.current = viewer;
      await waitForZamViewer(viewer, { isCancelled: () => cancelled, onProgress: (fraction) => onStatus("loading", Math.round(fraction * 100)) });
      if (cancelled) return;
      appliedRef.current = new Map(initial);
      const renderer = viewer.renderer;
      if (renderer) {
        renderer.distance = 6.6;
        renderer.zenith = 1.55;
        renderer.azimuth = -1.57;
        homeRef.current = { distance: renderer.distance, zenith: renderer.zenith, azimuth: renderer.azimuth };
      }
      resizeViewer(viewer, host.clientWidth, host.clientHeight);
      if (process.env.NODE_ENV !== "production") (window as unknown as { __transmogViewer?: WowViewer }).__transmogViewer = viewer;
      report("ready");
    };
    boot().catch(() => { if (!cancelled) report("error"); });
    return () => {
      cancelled = true;
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
      appliedRef.current = new Map();
      host.replaceChildren();
    };
  }, [attempt, modelId, onStatus, report, requested]);

  // Swap only what changed: cleared slots first, then new displays.
  useEffect(() => {
    if (status !== "ready") return;
    const viewer = viewerRef.current;
    const applied = appliedRef.current;
    const removed = [...applied.keys()].filter((slot) => !items.has(slot));
    const changed: ViewerItem[] = [...items.entries()].filter(([slot, display]) => applied.get(slot) !== display).map(([slot, display]) => ({ slot, display }));
    if (removed.length) clearViewerSlots(viewer, removed);
    if (changed.length) setViewerItems(viewer, changed);
    appliedRef.current = new Map(items);
    // A newer change cancels the wait of the previous one, so every change ends with busy(false).
    if (!changed.length) { onBusyRef.current?.(false); return; }
    let cancelled = false;
    onBusyRef.current?.(true);
    void waitForZamQuiet({ isCancelled: () => cancelled }).then(() => { if (!cancelled) onBusyRef.current?.(false); });
    return () => { cancelled = true; };
  }, [items, status]);

  useEffect(() => {
    if (status === "ready") setViewerPose(viewerRef.current, pose);
  }, [pose, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const apply = () => pauseViewer(viewerRef.current, paused || reducedMotion());
    apply();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", apply);
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion", "data-ui-motion"] });
    return () => { query.removeEventListener("change", apply); observer.disconnect(); };
  }, [paused, status]);

  // Keep the drawing buffer the size of the stage (format changes, layout).
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== "ready") return;
    const observer = new ResizeObserver(() => { if (!capturingRef.current) resizeViewer(viewerRef.current, host.clientWidth, host.clientHeight); });
    observer.observe(host);
    resizeViewer(viewerRef.current, host.clientWidth, host.clientHeight);
    return () => observer.disconnect();
  }, [aspect, status]);

  // The preview background lives inside WebGL (see stageBackgroundURL); it is
  // repainted for the stage size, debounced while the layout settles.
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      if (!capturingRef.current) setStageSize({ width: host.clientWidth, height: host.clientHeight });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (status !== "ready" || !stageSize.width || !stageSize.height) return;
    const viewer = viewerRef.current;
    if (background.kind === "transparent") {
      setViewerBackground(viewer, null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const timer = window.setTimeout(() => {
      stageBackgroundURL(background, stageSize.width, stageSize.height, shadow).then((made) => {
        url = made;
        if (cancelled) return URL.revokeObjectURL(made);
        setViewerBackground(viewerRef.current, made);
      }).catch(() => setViewerBackground(viewerRef.current, null));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // The viewer has decoded the image into a texture by the next change.
      if (url) { const stale = url; window.setTimeout(() => URL.revokeObjectURL(stale), 4_000); }
    };
  }, [background, shadow, stageSize, status]);

  const camera = useCallback((change: (renderer: NonNullable<WowViewer["renderer"]>, home: Camera) => void) => {
    const renderer = viewerRef.current?.renderer;
    if (renderer && homeRef.current) change(renderer, homeRef.current);
  }, []);
  const rotate = useCallback((direction: 1 | -1) => camera((renderer) => { renderer.azimuth += direction * ROTATE_STEP; }), [camera]);
  const zoom = useCallback((factor: number) => camera((renderer, home) => {
    renderer.distance = Math.min(home.distance * 2.2, Math.max(home.distance * 0.35, renderer.distance * factor));
  }), [camera]);
  const resetCamera = useCallback(() => camera((renderer, home) => {
    renderer.distance = home.distance;
    renderer.zenith = home.zenith;
    renderer.azimuth = home.azimuth;
  }), [camera]);

  useImperativeHandle(ref, () => ({
    capture: async (width, height) => {
      // The viewer pins its container height while it renders at export size;
      // the stage must not answer that with a resize of its own.
      capturingRef.current = true;
      try {
        return await captureViewer(viewerRef.current, width, height);
      } finally {
        capturingRef.current = false;
        const host = hostRef.current;
        if (host) resizeViewer(viewerRef.current, host.clientWidth, host.clientHeight);
      }
    },
    rotate, zoom, resetCamera, retry: () => setAttempt((value) => value + 1),
  }), [resetCamera, rotate, zoom]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (status !== "ready" || event.target !== event.currentTarget) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotate(-1), ArrowRight: () => rotate(1), ArrowUp: () => zoom(1 / ZOOM_STEP), ArrowDown: () => zoom(ZOOM_STEP),
      "+": () => zoom(1 / ZOOM_STEP), "=": () => zoom(1 / ZOOM_STEP), "-": () => zoom(ZOOM_STEP), Home: resetCamera,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  // Touch: vertical swipes scroll the page, horizontal drags turn the model, two fingers zoom.
  const spread = () => {
    const [a, b] = [...pointersRef.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchRef.current = spread();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    const renderer = viewerRef.current?.renderer;
    if (!previous || !renderer) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const now = spread();
      if (pinchRef.current && now) zoom(pinchRef.current / now);
      pinchRef.current = now;
      return;
    }
    renderer.azimuth -= ((event.clientX - previous.x) / Math.max(1, event.currentTarget.clientWidth)) * Math.PI * 2;
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = spread();
  };

  const backgroundStyle: CSSProperties = background.kind === "color" ? { background: background.color }
    : background.kind === "gradient" ? { background: `linear-gradient(${background.angle}deg, ${background.stops[0]}, ${background.stops[1]})` }
      : background.kind === "scene" ? { backgroundImage: `url(${background.src})`, backgroundPosition: background.position }
        : {};

  return (
    <div
      ref={rootRef}
      className={styles.stage}
      style={{ aspectRatio: String(aspect), "--stage-brightness": brightness, "--stage-contrast": contrast, "--stage-shadow": shadow } as CSSProperties}
      data-stage-state={status}
      data-background={background.kind}
      role="img"
      aria-label={label}
      tabIndex={status === "ready" ? 0 : -1}
      onKeyDown={onKeyDown}
    >
      <div className={styles.stageBackground} style={backgroundStyle} aria-hidden="true" />
      {background.kind === "scene" ? <div className={styles.stageVignette} aria-hidden="true" /> : null}
      <div className={styles.stageShadow} aria-hidden="true" />
      {poster ? <img className={styles.poster} src={poster} alt="" aria-hidden="true" fetchPriority="high" decoding="async" data-poster-hidden={status === "ready" || undefined} /> : null}
      <div ref={hostRef} className={styles.stageHost} aria-hidden="true" data-host-ready={status === "ready" || undefined} />
      {status === "ready" ? (
        <div className={styles.touchShield} aria-hidden="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} />
      ) : null}
      {children}
    </div>
  );
}
