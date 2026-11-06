"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import type { CharacterAppearanceProfile } from "@/lib/wow/characterAudit";
import type { Lang } from "@/lib/i18n";
import {
  createZamViewer, loadZamViewerScript, prepareZamViewer, waitForZamViewer, wakeViewerLoop, webglAvailable, ZAM_CONTENT_PATH, ZAM_MODEL_TYPE, type WowViewer,
} from "@/lib/wow/zamModelViewer";
import { pauseViewer, resizeViewer } from "@/lib/wow/transmog/viewer";
import { characterPageCopy } from "./characterPageCopy";
import styles from "./characterEquipment.module.css";

export type ModelViewerStatus = "loading" | "ready" | "error";
type ViewerProps = {
  lang?: Lang;
  appearance: CharacterAppearanceProfile;
  characterName: string;
  characterSlug: string;
  onStatus?: (status: ModelViewerStatus) => void;
};
type WowCustomization = { Options: Array<{ Id: number; Choices: Array<{ Id: number }> }> };
type Camera = { distance: number; zenith: number; azimuth: number };
type FramedRenderer = NonNullable<WowViewer["renderer"]> & {
  fov?: number;
  translationFromModel?: ArrayLike<number>;
  zoom?: { target?: number; current?: number };
};

const ROTATE_STEP = Math.PI / 8;
const ZOOM_STEP = 1.15;
const BASE_CAMERA: Camera = { distance: 6, zenith: 1.52, azimuth: -1.57 };

function reducedMotion() {
  return document.documentElement.dataset.motion === "reduced" || document.documentElement.dataset.uiMotion === "reduce"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Camera that shows the whole character above the toggle. The viewer looks at the model's centre
 * (`translationFromModel`, half its height below the origin) with a vertical field of view, so the distance
 * follows the model height; narrow stages step back a little more for the weapons at the sides.
 */
function homeCamera(renderer: FramedRenderer, aspect: number): Camera {
  const centre = Math.abs(Number(renderer.translationFromModel?.[1] ?? 0));
  if (!Number.isFinite(centre) || centre < 0.2 || centre > 10) return BASE_CAMERA;
  const fov = ((renderer.fov ?? 30) * Math.PI) / 180;
  const fill = 0.74;
  const distance = (centre * 2) / (2 * Math.tan(fov / 2) * fill) * Math.max(1, 0.76 / Math.max(0.2, aspect));
  return { ...BASE_CAMERA, distance };
}

/** The character's 3D model in its current equipment. Mounted only when the reader asks for it (the viewer
 * downloads several megabytes and draws every frame) and destroyed when they close it. */
export function CharacterModelViewer({ appearance, characterName, characterSlug, lang = "ru", onStatus }: ViewerProps) {
  const copy = characterPageCopy(lang);
  const imported = appearance.presetId.startsWith("battlenet-");
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WowViewer | null>(null);
  const homeRef = useRef<Camera>(BASE_CAMERA);
  const engagedRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ModelViewerStatus>("loading");

  useEffect(() => { onStatus?.(status); }, [onStatus, status]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    host.replaceChildren();

    const boot = async () => {
      if (!webglAvailable()) throw new Error("WebGL unavailable");
      await prepareZamViewer();
      let modelItems = appearance.modelItems;
      if (imported) {
        const response = await fetch(`/api/wow/characters/${encodeURIComponent(characterSlug)}/model-items?locale=${lang}`, { cache: "no-store" });
        if (!response.ok) throw new Error("character model items unavailable");
        const payload = await response.json() as { modelItems?: Array<[number, number]> };
        modelItems = payload.modelItems ?? [];
      }
      const customizationResponse = await fetch(`${ZAM_CONTENT_PATH}meta/charactercustomization/${appearance.modelId}.json`);
      if (!customizationResponse.ok) throw new Error("character customization unavailable");
      const customization = await customizationResponse.json() as WowCustomization;
      const availableChoices = new Map(customization.Options.map((option) => [option.Id, new Set(option.Choices.map((choice) => choice.Id))]));
      const importedOptions = appearance.customizations?.filter((option) => availableChoices.get(option.optionId)?.has(option.choiceId));
      const options = importedOptions?.length
        ? importedOptions
        : customization.Options.filter((option) => option.Choices.length > 0).map((option) => ({ optionId: option.Id, choiceId: option.Choices[0].Id }));

      await loadZamViewerScript();
      if (cancelled || !hostRef.current) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const viewer = createZamViewer(host, {
        aspect: width / height,
        hd: true,
        models: { id: appearance.modelId, type: ZAM_MODEL_TYPE.character },
        charCustomization: { options },
        items: modelItems.map((item) => [...item]),
        // The wheel zooms once the reader has grabbed the model (or holds Ctrl); otherwise it scrolls the page.
        wheelEventValidation: (event: { originalEvent?: WheelEvent }) =>
          Boolean(engagedRef.current || event.originalEvent?.ctrlKey || event.originalEvent?.metaKey),
      });
      viewerRef.current = viewer;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __characterViewer?: WowViewer }).__characterViewer = viewer;
      await waitForZamViewer(viewer, { isCancelled: () => cancelled });
      if (cancelled) return;
      const renderer = viewer.renderer as FramedRenderer | null;
      if (renderer) {
        homeRef.current = homeCamera(renderer, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight));
        Object.assign(renderer, homeRef.current);
      }
      resizeViewer(viewer, host.clientWidth, host.clientHeight);
      if (reducedMotion()) pauseViewer(viewer, true);
      setStatus("ready");
    };

    boot().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
      host.replaceChildren();
    };
  }, [attempt, appearance.customizations, appearance.modelId, appearance.modelItems, characterSlug, imported, lang]);

  // Keep the drawing buffer the size of the stage.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || status !== "ready") return;
    const observer = new ResizeObserver(() => resizeViewer(viewerRef.current, host.clientWidth, host.clientHeight));
    observer.observe(host);
    return () => observer.disconnect();
  }, [status]);

  const camera = useCallback((change: (renderer: NonNullable<WowViewer["renderer"]>, home: Camera) => void) => {
    const viewer = viewerRef.current;
    if (!viewer?.renderer) return;
    change(viewer.renderer, homeRef.current);
    wakeViewerLoop(viewer);
  }, []);
  const rotate = (direction: 1 | -1) => camera((renderer) => { renderer.azimuth += direction * ROTATE_STEP; });
  const zoom = (factor: number) => camera((renderer, home) => {
    renderer.distance = Math.min(home.distance * 1.8, Math.max(home.distance * 0.4, renderer.distance * factor));
  });
  const reset = () => camera((renderer, home) => {
    Object.assign(renderer, home);
    const zoomState = (renderer as FramedRenderer).zoom;
    if (zoomState) { zoomState.target = 1; zoomState.current = 1; }
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (status !== "ready" || event.target !== event.currentTarget) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotate(-1), ArrowRight: () => rotate(1), "+": () => zoom(1 / ZOOM_STEP), "=": () => zoom(1 / ZOOM_STEP), "-": () => zoom(ZOOM_STEP), Home: reset,
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
  const onTouchDown = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchRef.current = spread();
  };
  const onTouchMove = (event: PointerEvent<HTMLDivElement>) => {
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
    camera((current) => { current.azimuth -= ((event.clientX - previous.x) / Math.max(1, event.currentTarget.clientWidth)) * Math.PI * 2; });
  };
  const onTouchEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = spread();
  };

  return (
    <div
      className={styles.viewer}
      data-model-state={status}
      role="img"
      aria-label={`${copy.model3d}: ${characterName}`}
      tabIndex={status === "ready" ? 0 : -1}
      onKeyDown={onKeyDown}
      onPointerDown={() => { engagedRef.current = true; }}
      onPointerLeave={() => { engagedRef.current = false; }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) engagedRef.current = false; }}
    >
      <div ref={hostRef} className={styles.viewerHost} aria-hidden="true" />
      {status === "ready" ? <div className={styles.touchShield} aria-hidden="true" onPointerDown={onTouchDown} onPointerMove={onTouchMove} onPointerUp={onTouchEnd} onPointerCancel={onTouchEnd} /> : null}
      {status === "ready" ? <button type="button" className={styles.viewerReset} onClick={reset} aria-label={copy.modelReset} title={copy.modelReset}><RotateCcw aria-hidden="true" /></button> : null}
      {status === "loading" ? <span className={styles.viewerBusy} role="status"><LoaderCircle aria-hidden="true" className={styles.spin} /><span className={styles.srOnly}>{copy.modelLoading}</span></span> : null}
      {status === "error" ? <span className={styles.viewerError} role="alert">
        <span>{copy.modelError}</span>
        <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}><RefreshCw aria-hidden="true" />{copy.retry}</button>
      </span> : null}
    </div>
  );
}
