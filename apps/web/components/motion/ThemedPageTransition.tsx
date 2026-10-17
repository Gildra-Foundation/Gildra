"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { HomeThemeId } from "../platform/home/homeThemes";
import { lessMotion } from "@/lib/client/motionPreference";
import { iceCrackSound } from "./iceCrackSound";
import styles from "./routeTransition.module.css";

export type PageTransitionHandle = {
  start: (frame: HTMLElement, theme: HomeThemeId) => void;
  reveal: () => boolean;
  cancel: () => void;
};

// A shared centre and boundary vertices tile the viewport without gaps.
const rim = [[0, 0], [28, 0], [62, 0], [100, 0], [100, 31], [100, 68], [100, 100], [70, 100], [37, 100], [0, 100], [0, 65], [0, 27]];
const centre = [48, 46];
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
  const stopSound = useRef<(() => void) | undefined>(undefined);

  function cancel() {
    stopSound.current?.();
    stopSound.current = undefined;
    timers.current.forEach(clearTimeout);
    cancelAnimationFrame(crackFrame.current);
    timers.current = [];
    host.current?.replaceChildren();
    if (host.current) delete host.current.dataset.phase;
    delete document.documentElement.dataset.pageTransition;
    revealing.current = false;
    destinationReady.current = false;
    cracksReady.current = false;
    started.current = 0;
  }

  function shatter() {
    if (!destinationReady.current || !cracksReady.current || revealing.current || !host.current) return;
    revealing.current = true;
    host.current.dataset.phase = "shattering";
    timers.current.push(setTimeout(cancel, 760));
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
      const count = theme === "arthas" ? rim.length : 1;
      const sequence = ++snapshotSequence;
      for (let index = 0; index < count; index++) {
        const piece = document.createElement("div");
        piece.className = styles.piece;
        if (theme === "arthas") {
          const a = rim[index], b = rim[(index + 1) % rim.length];
          piece.style.clipPath = `polygon(${centre[0]}% ${centre[1]}%,${a[0]}% ${a[1]}%,${b[0]}% ${b[1]}%)`;
          piece.style.setProperty("--shard-x", `${((a[0] + b[0]) / 2 - centre[0]) * .9}vw`);
          piece.style.setProperty("--shard-y", `${((a[1] + b[1]) / 2 - centre[1]) * .9 + 18}vh`);
          piece.style.setProperty("--shard-turn", `${index % 2 ? 13 : -11}deg`);
          piece.style.setProperty("--shard-delay", `${index % 4 * 22}ms`);
        }
        const fragment = index === count - 1 ? snapshot : snapshot.cloneNode(true) as HTMLElement;
        isolateReferences(fragment, `route-fragment-${sequence}-${index}-`);
        piece.append(fragment);
        root.append(piece);
      }
      if (theme === "arthas") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.classList.add(styles.cracks);
        rim.forEach(([x, y], index) => {
          const path = document.createElementNS(svg.namespaceURI, "path");
          const mx = 48 + (x - 48) * .55, my = 46 + (y - 46) * .55;
          path.setAttribute("d", `M48 46 L${mx + (index % 2 ? 2 : -2)} ${my} L${x} ${y} M${mx} ${my} l${index % 2 ? 5 : -5} -7`);
          path.setAttribute("pathLength", "100");
          svg.append(path);
        });
        root.append(svg);
      }
      // Start phase clocks after the fragments exist. Snapshot construction and
      // a native View Transition commit must not consume the crack's screen time.
      started.current = 1;
      if (theme === "arthas") stopSound.current = iceCrackSound();
      timers.current.push(setTimeout(() => {
        root.dataset.phase = "cracking";
        crackFrame.current = requestAnimationFrame(() => {
          timers.current.push(setTimeout(() => {
            cracksReady.current = true;
            shatter();
          }, 220));
        });
      }, 340));
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
