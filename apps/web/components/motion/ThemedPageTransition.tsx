"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { HomeThemeId } from "../platform/home/homeThemes";
import { lessMotion } from "@/lib/client/motionPreference";
import { iceCrackSound } from "./iceCrackSound";
import styles from "./routeTransition.module.css";
import { iceFracture, ICE_FREEZE_MS, ICE_CRACK_MS, ICE_RELEASE_MS } from "./iceFracture";
import { createIceFrost } from "./iceFrost";

export type PageTransitionHandle = {
  start: (frame: HTMLElement, theme: HomeThemeId) => void;
  reveal: () => boolean;
  cancel: () => void;
};

let snapshotSequence = 0;

/** Preserve SVG masks/use references without duplicating the live page's IDs. */
function isolateReferences(fragment: HTMLElement, prefix: string) {
  const ids = new Map<string, string>();
  fragment.querySelectorAll<HTMLElement>("[id]").forEach(element => {
    const previous = element.id;
    element.id = prefix + previous;
    ids.set(previous, element.id);
  });
  fragment.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "id") continue;
      let value = attribute.value.replace(/url\(["']?#([^\s)"']+)["']?\)/g, (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#") && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  });
}

/** Clone visible content only. The inert fragments never run React or handlers. */
function frozenPage(frame: HTMLElement) {
  const copy = frame.cloneNode(true) as HTMLElement;
  const prune = (source: Element, target: Element) => {
    const originals = Array.from(source.children);
    Array.from(target.children).forEach((child, index) => {
      const original = originals[index];
      if (/^(SCRIPT|IFRAME|AUDIO|VIDEO)$/.test(child.tagName)) { child.remove(); return; }
      const box = original.getBoundingClientRect();
      if (box.width && box.height && (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth)) {
        // Preserve flow so later visible siblings keep their original positions.
        child.replaceChildren();
        if (child instanceof HTMLElement) {
          child.style.height = `${box.height}px`;
          child.style.width = `${box.width}px`;
        }
        return;
      }
      if (original instanceof HTMLCanvasElement) {
        try {
          const image = document.createElement("img");
          image.src = original.toDataURL();
          image.style.cssText = `width:${box.width}px;height:${box.height}px`;
          child.replaceWith(image);
        } catch { child.remove(); }
      } else if (original instanceof HTMLInputElement) {
        // Do not duplicate credentials or typed private fields into the effect.
        (child as HTMLInputElement).value = "";
        child.removeAttribute("value");
      } else prune(original, child);
    });
  };
  prune(frame, copy);
  const rect = frame.getBoundingClientRect();
  copy.removeAttribute("id");
  copy.removeAttribute("data-book-route-frame");
  copy.removeAttribute("data-route-state");
  copy.style.cssText = `position:absolute;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;margin:0;opacity:1;transform:none`;
  const viewport = document.createElement("div");
  viewport.className = styles.frozen;
  viewport.style.cssText = `position:absolute;inset:0;overflow:hidden;width:${innerWidth}px;height:${innerHeight}px`;
  viewport.append(copy);
  // The toolbar and contents dialog live outside the route frame, but belong
  // to the outgoing screen too. Capture them before the new route closes them.
  for (const layer of document.querySelectorAll<HTMLElement>("header[data-atlas-scope], dialog[open]")) {
    if (frame.contains(layer)) continue;
    const frozen = layer.cloneNode(true) as HTMLElement;
    prune(layer, frozen);
    frozen.removeAttribute("id");
    const box = layer.getBoundingClientRect();
    frozen.style.cssText = `position:absolute;top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;margin:0;transform:none`;
    viewport.append(frozen);
  }
  return viewport;
}

/** Finite freeze → crack → shatter. Routing and data loading proceed underneath. */
export function ThemedPageTransition({ ref }: { ref: Ref<PageTransitionHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealing = useRef(false);
  const destinationReady = useRef(false);
  const cracksReady = useRef(false);
  const crackFrame = useRef(0);
  const frostFrame = useRef(0);
  const disposeIce = useRef<(() => void) | undefined>(undefined);
  const releaseIce = useRef<(() => void) | undefined>(undefined);
  const stopSound = useRef<(() => void) | undefined>(undefined);

  function cancel() {
    stopSound.current?.();
    stopSound.current = undefined;
    timers.current.forEach(clearTimeout);
    cancelAnimationFrame(crackFrame.current);
    cancelAnimationFrame(frostFrame.current);
    releaseIce.current = undefined;
    disposeIce.current?.();
    disposeIce.current = undefined;
    timers.current = [];
    host.current?.replaceChildren();
    if (host.current) {
      delete host.current.dataset.phase;
      host.current.style.removeProperty("--ice-skin");
    }
    delete document.documentElement.dataset.pageTransition;
    revealing.current = false;
    destinationReady.current = false;
    cracksReady.current = false;
    started.current = 0;
  }

  function shatter() {
    if (!destinationReady.current || !cracksReady.current || revealing.current || !host.current) return;
    revealing.current = true;
    releaseIce.current?.();
    releaseIce.current = undefined;
    host.current.dataset.phase = "shattering";
    timers.current.push(setTimeout(cancel, host.current.dataset.effect === "arthas" ? ICE_RELEASE_MS : 760));
  }

  useImperativeHandle(ref, () => ({
    cancel,
    start(frame, theme) {
      cancel();
      if (lessMotion() || !host.current) return;
      const root = host.current;
      const snapshot = frozenPage(frame);
      root.dataset.effect = theme;
      root.dataset.phase = "freezing";
      document.documentElement.dataset.pageTransition = theme;
      const fracture = theme === "arthas" ? iceFracture(innerWidth, innerHeight) : null;
      const frost = fracture ? createIceFrost(innerWidth, innerHeight) : null;
      disposeIce.current = frost?.dispose;
      const count = fracture?.cells.length ?? 1;
      const sequence = ++snapshotSequence;
      for (let index = 0; index < count; index++) {
        const piece = document.createElement("div");
        piece.className = styles.piece;
        if (fracture) {
          const { centre, points } = fracture.cells[index];
          piece.dataset.iceShard = "";
          piece.style.clipPath = `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(",")})`;
          piece.style.transformOrigin = `${centre[0]}px ${centre[1]}px`;
          const outward = (centre[0] / innerWidth - .5);
          piece.style.setProperty("--shard-x", `${outward * (100 + index % 3 * 35)}vw`);
          piece.style.setProperty("--shard-y", `${35 + centre[1] / innerHeight * 55 + index % 3 * 9}vh`);
          piece.style.setProperty("--shard-turn", `${outward * 60 + (index % 2 ? 12 : -12)}deg`);
          piece.style.setProperty("--shard-tilt", `${index % 2 ? 38 : -32}deg`);
          piece.style.setProperty("--shard-delay", `${Math.round((1 - centre[1] / innerHeight) * 90 + index % 3 * 14)}ms`);
        }
        const fragment = index === count - 1 ? snapshot : snapshot.cloneNode(true) as HTMLElement;
        isolateReferences(fragment, `route-fragment-${sequence}-${index}-`);
        piece.append(fragment);
        root.append(piece);
      }
      if (fracture) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
        svg.classList.add(styles.cracks);
        for (const { points, delay, fine } of [...fracture.cracks.map(crack => ({ ...crack, fine:false })), ...fracture.hairlines]) {
          const d = points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
          for (const shadow of [true, false]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("pathLength", "100");
            path.style.setProperty("--crack-delay", `${Math.round(delay)}ms`);
            if (shadow) path.classList.add(styles.crackShadow);
            if (fine) path.classList.add(styles.hairline);
            svg.append(path);
          }
        }
        root.append(svg);
        // Small chips carry only ice; the larger shards carry the outgoing page.
        fracture.cracks.filter((_, index) => index % 2 === 0).forEach(({ points }, index) => {
          const chip = document.createElement("span");
          chip.className = styles.chip;
          chip.style.left = `${points[1][0]}px`;
          chip.style.top = `${points[1][1]}px`;
          chip.style.setProperty("--chip-size", `${5 + index % 4 * 3}px`);
          chip.style.setProperty("--shard-x", `${(index % 2 ? 1 : -1) * (10 + index % 5 * 7)}vw`);
          chip.style.setProperty("--shard-y", `${35 + index % 5 * 13}vh`);
          chip.style.setProperty("--shard-turn", `${index % 2 ? 140 : -170}deg`);
          root.append(chip);
        });
      }
      // Start phase clocks after capture so cached routes still paint every stage.
      started.current = 1;
      const freezeMs = fracture ? ICE_FREEZE_MS : 340;
      if (fracture) stopSound.current = iceCrackSound(freezeMs / 1000);
      const crack = () => {
        if (frost && fracture) {
          root.style.setProperty("--ice-skin", frost.skin());
          frost.canvas.remove();
          releaseIce.current = () => root.style.setProperty("--ice-skin", frost.skin([...fracture.cracks, ...fracture.hairlines]));
        }
        root.dataset.phase = "cracking";
        crackFrame.current = requestAnimationFrame(() => {
          timers.current.push(setTimeout(() => {
            cracksReady.current = true;
            shatter();
          }, fracture ? ICE_CRACK_MS : 220));
        });
      };
      if (frost) {
        frost.canvas.className = styles.frost;
        root.append(frost.canvas);
        let origin: number | undefined;
        const grow = (now: number) => {
          origin ??= now;
          const progress = Math.min(1, (now - origin) / freezeMs);
          frost.draw(progress);
          if (progress < 1) frostFrame.current = requestAnimationFrame(grow);
          else crack();
        };
        frostFrame.current = requestAnimationFrame(grow);
      } else timers.current.push(setTimeout(crack, freezeMs));
      // Abort/offline safety also covers a route whose loading marker never clears.
      timers.current.push(setTimeout(cancel, 12000));
    },
    reveal() {
      if (!started.current || !host.current) return false;
      if (lessMotion()) { cancel(); return false; }
      destinationReady.current = true;
      shatter();
      return true;
    },
  }));

  useEffect(() => {
    // A resize invalidates the viewport snapshot. Escape is handled by the runtime.
    window.addEventListener("resize", cancel);
    return () => { window.removeEventListener("resize", cancel); cancel(); };
  }, []);

  return <div ref={host} className={styles.transition} data-themed-transition aria-hidden="true" inert />;
}
