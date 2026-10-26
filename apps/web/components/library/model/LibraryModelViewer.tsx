"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  createZamViewer,
  loadZamViewerScript,
  prepareZamViewer,
  waitForZamViewer,
  webglAvailable,
  ZAM_CONTENT_PATH,
  ZAM_MODEL_TYPE,
  type WowViewer,
} from "@/lib/wow/zamModelViewer";
import { libraryModelCopy as copy } from "./libraryModelCopy";
import styles from "./libraryModel.module.css";

export type LibraryModelSubject =
  | { kind: "mount"; displays: number[] }
  | { kind: "set"; items: Array<[slot: number, displayId: number]> };

type Props = {
  subject: LibraryModelSubject;
  name: string;
  lang: "en" | "ru";
  /** 2D picture shown without WebGL or when the model fails. */
  fallbackImage?: string;
  /** Built-in rotate/zoom/reset buttons; off when the page draws its own. */
  controls?: boolean;
  /** Load as soon as the slot nears the viewport; otherwise wait for a click (heavy models). */
  autoLoad?: boolean;
  /** Download size shown on the click-to-load button. */
  loadHint?: string;
};

type Status = "idle" | "loading" | "ready" | "error" | "unsupported";
type Camera = { distance: number; zenith: number; azimuth: number };
type Customization = { Options: Array<{ Id: number; Choices: Array<{ Id: number }> }> };

/** Human ChrModel ids of the Wowhead viewer: the mannequin for armor sets. */
const MANNEQUIN = { male: 1, female: 2 } as const;
const ROTATE_STEP = Math.PI / 8;
const ZOOM_STEP = 1.18;
const AUTO_ROTATE_RADIANS_PER_SECOND = 0.25;


function reducedMotion() {
  return document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function defaultCustomization(modelId: number) {
  const response = await fetch(`${ZAM_CONTENT_PATH}meta/charactercustomization/${modelId}.json`);
  if (!response.ok) throw new Error("character customization unavailable");
  const customization = await response.json() as Customization;
  return customization.Options
    .filter((option) => option.Choices.length > 0)
    .map((option) => ({ optionId: option.Id, choiceId: option.Choices[0].Id }));
}

export function LibraryModelViewer({ subject, name, lang, fallbackImage, controls = true, autoLoad = true, loadHint }: Props) {
  const text = copy[lang];
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WowViewer | null>(null);
  const homeRef = useRef<Camera | null>(null);
  const interactedRef = useRef(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const [mannequin, setMannequin] = useState<keyof typeof MANNEQUIN>("male");
  const [variant, setVariant] = useState(0);
  const [requested, setRequested] = useState(autoLoad);
  const [progress, setProgress] = useState(0);
  const [coarse, setCoarse] = useState(false);
  const dragRef = useRef<{ x: number; id: number } | null>(null);
  const subjectKey = JSON.stringify(subject);

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      setNearViewport(true);
    }, { rootMargin: "200px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || !requested) return;
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    host.replaceChildren();
    homeRef.current = null;
    interactedRef.current = false;
    setStatus("loading");
    setProgress(0);
    const parsed = JSON.parse(subjectKey) as LibraryModelSubject;

    const boot = async () => {
      prepareZamViewer();
      let options: Record<string, unknown>;
      if (parsed.kind === "mount") {
        const displayId = parsed.displays[variant] ?? parsed.displays[0];
        options = { aspect: 1, hd: true, models: { id: displayId, type: ZAM_MODEL_TYPE.npc } };
      } else {
        const modelId = MANNEQUIN[mannequin];
        const charOptions = await defaultCustomization(modelId);
        options = {
          aspect: 1,
          hd: true,
          models: { id: modelId, type: ZAM_MODEL_TYPE.character },
          charCustomization: { options: charOptions },
          items: parsed.items.map((item) => [...item]),
        };
      }
      await loadZamViewerScript();
      if (cancelled || !hostRef.current) return;
      // The viewer swallows wheel events; zoom only once the reader focused the model or holds Ctrl.
      const wheelEventValidation = (event: { originalEvent?: WheelEvent }) =>
        Boolean(event.originalEvent?.ctrlKey || event.originalEvent?.metaKey || rootRef.current?.contains(document.activeElement));
      const viewer = createZamViewer(hostRef.current, { ...options, wheelEventValidation });
      viewerRef.current = viewer;
      await waitForZamViewer(viewer, { isCancelled: () => cancelled, onProgress: (fraction) => setProgress(Math.round(fraction * 100)) });
      if (cancelled) return;
      const renderer = viewer.renderer;
      if (renderer) {
        if (parsed.kind === "set") {
          renderer.distance = 4.75;
          renderer.zenith = 1.55;
          renderer.azimuth = -1.57;
        }
        homeRef.current = { distance: renderer.distance, zenith: renderer.zenith, azimuth: renderer.azimuth };
      }
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
  }, [attempt, mannequin, nearViewport, requested, subjectKey, variant]);

  // Slow turntable until the reader touches the model. Reduced motion (OS or
  // site setting): no turntable and the idle animation is frozen.
  useEffect(() => {
    if (status !== "ready") return;
    let frame = 0;
    let last = performance.now();
    let paused: boolean | null = null;
    const step = (now: number) => {
      const renderer = viewerRef.current?.renderer;
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      const reduced = reducedMotion();
      if (renderer && reduced !== paused) {
        paused = reduced;
        for (const actor of renderer.actors ?? []) actor.setAnimPaused?.(reduced);
      }
      if (renderer && !interactedRef.current && !document.hidden && !reduced) {
        renderer.azimuth += AUTO_ROTATE_RADIANS_PER_SECOND * seconds;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  const camera = useCallback((change: (renderer: NonNullable<WowViewer["renderer"]>, home: Camera) => void) => {
    interactedRef.current = true;
    const renderer = viewerRef.current?.renderer;
    const home = homeRef.current;
    if (renderer && home) change(renderer, home);
  }, []);
  const rotate = (direction: 1 | -1) => camera((renderer) => { renderer.azimuth += direction * ROTATE_STEP; });
  const zoom = (factor: number) => camera((renderer, home) => {
    renderer.distance = Math.min(home.distance * 2, Math.max(home.distance * 0.45, renderer.distance * factor));
  });
  const reset = () => camera((renderer, home) => {
    renderer.distance = home.distance;
    renderer.zenith = home.zenith;
    renderer.azimuth = home.azimuth;
  });

  // Touch: the upstream viewer blocks page scrolling. A pan-y shield keeps vertical
  // swipes for the page and turns horizontal drags into rotation.
  const onShieldPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    interactedRef.current = true;
    dragRef.current = { x: event.clientX, id: event.pointerId };
  };
  const onShieldPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const renderer = viewerRef.current?.renderer;
    if (!drag || drag.id !== event.pointerId || !renderer) return;
    const width = event.currentTarget.clientWidth || 1;
    renderer.azimuth -= ((event.clientX - drag.x) / width) * Math.PI * 2;
    drag.x = event.clientX;
  };
  const endShieldDrag = () => { dragRef.current = null; };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (status !== "ready" || event.target !== event.currentTarget) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotate(-1),
      ArrowRight: () => rotate(1),
      ArrowUp: () => zoom(1 / ZOOM_STEP),
      ArrowDown: () => zoom(ZOOM_STEP),
      Home: reset,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const variants = subject.kind === "mount" ? subject.displays.length : 0;
  const showFallback = status === "error" || status === "unsupported";

  return (
    <div
      ref={rootRef}
      className={styles.viewer}
      data-model-state={status}
      data-model-kind={subject.kind}
      role="img"
      aria-label={text.label(name)}
      tabIndex={status === "ready" ? 0 : -1}
      onKeyDown={onKeyDown}
      onPointerDown={() => { interactedRef.current = true; }}
      onWheel={() => { interactedRef.current = true; }}
    >
      <div ref={hostRef} className={styles.host} aria-hidden="true" />
      {coarse && status === "ready" ? (
        <div
          className={styles.touchShield}
          aria-hidden="true"
          onPointerDown={onShieldPointerDown}
          onPointerMove={onShieldPointerMove}
          onPointerUp={endShieldDrag}
          onPointerCancel={endShieldDrag}
        />
      ) : null}
      {showFallback && fallbackImage ? <img className={styles.fallbackImage} src={fallbackImage} alt="" loading="lazy" decoding="async" /> : null}
      {status !== "ready" ? (
        <p className={styles.status} aria-live="polite">
          {status === "loading" ? <><i className={styles.spinner} aria-hidden="true" />{text.loading}{progress > 0 && progress < 100 ? ` ${progress}%` : null}</> : null}
          {status === "idle" && requested ? text.idle : null}
          {status === "idle" && !requested ? (
            <button type="button" className={`${styles.button} ${styles.load}`} data-model-load onClick={() => setRequested(true)}>
              <span>{text.load}</span>
              {loadHint ? <small>{loadHint}</small> : null}
            </button>
          ) : null}
          {status === "unsupported" ? text.unsupported : null}
          {status === "error" ? (
            <>
              <span>{text.error}</span>
              <button type="button" className={styles.button} onClick={() => setAttempt((value) => value + 1)}>{text.retry}</button>
            </>
          ) : null}
        </p>
      ) : null}
      {controls && status === "ready" ? (
        <div className={styles.controls} data-model-controls>
          <button type="button" className={styles.button} onClick={() => rotate(-1)} aria-label={text.left} title={text.left}><RotateCcw size={20} aria-hidden="true" /></button>
          <button type="button" className={styles.button} onClick={() => rotate(1)} aria-label={text.right} title={text.right}><RotateCw size={20} aria-hidden="true" /></button>
          <button type="button" className={styles.button} onClick={() => zoom(1 / ZOOM_STEP)} aria-label={text.zoomIn} title={text.zoomIn}><ZoomIn size={20} aria-hidden="true" /></button>
          <button type="button" className={styles.button} onClick={() => zoom(ZOOM_STEP)} aria-label={text.zoomOut} title={text.zoomOut}><ZoomOut size={20} aria-hidden="true" /></button>
          <button type="button" className={styles.button} onClick={reset} aria-label={text.reset} title={text.reset}><LocateFixed size={20} aria-hidden="true" /></button>
        </div>
      ) : null}
      {controls && subject.kind === "set" && (status === "ready" || status === "error") ? (
        <div className={styles.options} role="group" aria-label={text.mannequin}>
          <button type="button" className={styles.button} aria-pressed={mannequin === "male"} onClick={() => setMannequin("male")} title={text.male}>{text.maleShort}</button>
          <button type="button" className={styles.button} aria-pressed={mannequin === "female"} onClick={() => setMannequin("female")} title={text.female}>{text.femaleShort}</button>
        </div>
      ) : null}
      {controls && variants > 1 && (status === "ready" || status === "error") ? (
        <div className={styles.options}>
          <button type="button" className={`${styles.button} ${styles.wide}`} onClick={() => setVariant((value) => (value + 1) % variants)}>
            {text.variant(variant + 1, variants)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
