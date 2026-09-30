"use client";

import $ from "jquery";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CharacterAppearanceProfile } from "@/lib/wow/characterAudit";
import styles from "./characterAuditPage.module.css";
import type { Lang } from "@/lib/i18n";

type ViewerProps = {
  lang?: Lang;
  appearance: CharacterAppearanceProfile;
  focusSlot: string | null;
  characterName: string;
  race: string;
  specIcon: string;
  accent: string;
  characterSlug: string;
};
type WowRenderer = {
  distance: number;
  zenith: number;
  azimuth: number;
  actors?: unknown[];
  downloads?: Record<string, unknown>;
  progressShown?: boolean;
};
type WowViewer = { renderer: WowRenderer | null; destroy?: () => void };
type WowViewerConstructor = new (options: Record<string, unknown>) => WowViewer;
type WowCustomization = { Options: Array<{ Id: number; Choices: Array<{ Id: number }> }> };

declare global {
  interface Window {
    $: JQueryStatic;
    jQuery: JQueryStatic;
    WH?: Record<string, unknown>;
    ZamModelViewer?: WowViewerConstructor;
  }
}

const VIEWER_SCRIPT = "https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js";
const CONTENT_PATH = "/api/wow-model/";
let viewerScriptPromise: Promise<void> | null = null;

function loadViewerScript() {
  if (window.ZamModelViewer) return Promise.resolve();
  if (viewerScriptPromise) return viewerScriptPromise;
  viewerScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${VIEWER_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("viewer script unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = VIEWER_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("viewer script unavailable"));
    document.head.appendChild(script);
  });
  viewerScriptPromise.catch(() => { viewerScriptPromise = null; });
  return viewerScriptPromise;
}

function configureViewerGlobals() {
  window.$ = $;
  window.jQuery = $;
  window.WH = {
    ...(window.WH ?? {}),
    debug: () => undefined,
    defaultAnimation: "Stand",
    WebP: { getImageExtension: () => ".webp" },
    Wow: { Item: {} },
  };
}

export function CharacterModelViewer({ appearance, focusSlot, characterName, race, specIcon, accent, characterSlug, lang = "ru" }: ViewerProps) {
  const ru = lang === "ru";
  const imported = appearance.presetId.startsWith("battlenet-");
  const viewportRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WowViewer | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      setNearViewport(true);
    }, { rootMargin: "120px 0px" });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    let readyTimer: number | undefined;
    let positionTimer: number | undefined;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    setStatus("loading");

    const boot = async () => {
      configureViewerGlobals();
      let modelItems = appearance.modelItems;
      if (imported) {
        const response = await fetch(`/api/wow/characters/${encodeURIComponent(characterSlug)}/model-items?locale=${lang}`, { cache: "no-store" });
        if (!response.ok) throw new Error("character model items unavailable");
        const payload = await response.json() as { modelItems?: Array<[number, number]> };
        modelItems = payload.modelItems ?? [];
      }
      const customizationResponse = await fetch(`${CONTENT_PATH}meta/charactercustomization/${appearance.modelId}.json`);
      if (!customizationResponse.ok) throw new Error("character customization unavailable");
      const customization = await customizationResponse.json() as WowCustomization;
      const availableChoices = new Map(customization.Options.map((option) => [
        option.Id,
        new Set(option.Choices.map((choice) => choice.Id)),
      ]));
      const importedOptions = appearance.customizations?.filter((option) =>
        availableChoices.get(option.optionId)?.has(option.choiceId),
      );
      const options = importedOptions?.length
        ? importedOptions
        : customization.Options
            .filter((option) => option.Choices.length > 0)
            .map((option) => ({ optionId: option.Id, choiceId: option.Choices[0].Id }));

      await loadViewerScript();
      if (cancelled || !hostRef.current || !window.ZamModelViewer) return;
      const viewer = new window.ZamModelViewer({
        type: 2,
        contentPath: CONTENT_PATH,
        container: $(hostRef.current),
        aspect: 1,
        hd: true,
        models: { id: appearance.modelId, type: 16 },
        charCustomization: { options },
        items: modelItems.map((item) => [...item]),
      });
      viewerRef.current = viewer;

      const frameModel = () => {
        const renderer = viewer.renderer;
        if (!renderer) return;
        renderer.distance = 4.75;
        renderer.zenith = 1.55;
        renderer.azimuth = -1.57;
      };
      positionTimer = window.setTimeout(() => {
        frameModel();
      }, 450);

      const startedAt = Date.now();
      const waitUntilReady = () => {
        if (cancelled) return;
        const renderer = viewer.renderer;
        const actorsReady = Boolean(renderer?.actors?.length);
        const downloadsFinished = renderer ? Object.keys(renderer.downloads ?? {}).length === 0 : false;
        const elapsed = Date.now() - startedAt;
        // The upstream viewer occasionally leaves bookkeeping entries in
        // `downloads` after WebGL has already painted the character. Do not
        // keep a usable model hidden behind a 24-second loading veil.
        if (actorsReady && ((downloadsFinished && renderer?.progressShown === false) || elapsed > 4_500)) {
          readyTimer = window.setTimeout(() => {
            if (cancelled) return;
            frameModel();
            setStatus("ready");
          }, 600);
          return;
        }
        if (elapsed > 5_000) {
          setStatus("error");
          return;
        }
        readyTimer = window.setTimeout(waitUntilReady, 250);
      };
      waitUntilReady();
    };

    void boot().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      if (positionTimer) window.clearTimeout(positionTimer);
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
      host.replaceChildren();
    };
  }, [attempt, appearance.customizations, appearance.modelId, appearance.modelItems, appearance.presetId, characterSlug, imported, lang, nearViewport]);

  return (
    <div
      ref={viewportRef}
      className={`${styles.modelViewport} ${focusSlot ? styles.modelFocused : ""}`}
      data-book-surface="foldout"
      data-focus-slot={focusSlot ?? undefined}
      aria-label={ru ? `Интерактивная 3D-модель персонажа ${characterName}, ${race}, в текущей экипировке${imported ? " из Battle.net" : ""}` : `Interactive 3D model of ${characterName}, ${race}, wearing current equipment${imported ? " from Battle.net" : ""}`}
    >
      <div ref={hostRef} className={styles.wowModelHost} aria-hidden="true" />
      {status !== "ready" ? (
        <div className={styles.modelLoading} data-error={status === "error" || undefined}>
          {status === "error" ? (
            <>
              <div className={styles.modelSpecFallback} style={{ "--model-accent": accent } as CSSProperties} aria-hidden="true">
                <img src={specIcon} alt="" />
              </div>
              <span>{ru ? "3D-модель временно недоступна" : "3D model temporarily unavailable"}</span>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>{ru ? "Повторить" : "Retry"}</button>
            </>
          ) : status === "loading" ? <><i /><span>{ru ? "Подготавливаем модель" : "Preparing model"}: {characterName}…</span></> : <span>{ru ? "3D-модель появится при прокрутке" : "3D model loads when you reach it"}</span>}
        </div>
      ) : null}
      <div className={styles.modelFrame} aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className={styles.modelMeta} aria-hidden="true"><b>3D</b><span>{focusSlot ? `${ru ? "Осмотр" : "Inspect"}: ${focusSlot.toLocaleLowerCase(ru ? "ru-RU" : "en-US")}` : ru ? "Осмотр экипировки" : "Inspect equipment"}</span></div>
    </div>
  );
}
