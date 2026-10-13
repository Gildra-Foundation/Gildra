"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BookVolume } from "@/components/platform/navigation/BookVolume";
import { phoneBookArtworkSrc } from "@/components/platform/navigation/bookArtwork";
import type { CoverPose, OpenBookProps } from "./HomeBook";
import leafStyles from "./homeBook.module.css";
import styles from "./phoneBook.module.css";

// On a phone the book comes up to the middle of the screen and opens there: the
// cover grows to page size, swings open on its spine while the view follows it,
// and lands as the first page. One page fills the screen; the other is a swipe away.
// Only transform and opacity animate, so the compositor keeps the motion smooth.
const glide = 620;
const swingDelay = 340;
const swing = 1000;
const opened = swingDelay + swing;
const unveil = 320;
const glideEasing = "cubic-bezier(.4,0,.2,1)";
const swingEasing = "cubic-bezier(.42,0,.18,1)";
const identity = "matrix(1, 0, 0, 1, 0, 0)";
const shadeDepth = 0.55;
const step = 0.001;
const half = "inset(0 0 0 50%)";
const systemReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type PhoneBookProps = OpenBookProps & {
  onNavigate?: () => void;
  /** Toolbar launches can be dismissed before the cover has finished opening. */
  onDismiss?: () => void;
  reducedMotion?: () => boolean;
};

/** Maps the cover-sized region of the track onto the closed cover drawn on the page. */
function fromCover(pose: CoverPose, element: DOMRect, regionLeft: number, regionHeight: number) {
  const scale = pose.height / regionHeight;
  return new DOMMatrix().translate(-element.left, -element.top).multiply(pose.visual)
    .translate(pose.x - scale * regionLeft, pose.y).scale(scale).toString();
}

const shift = (x: number) => new DOMMatrix().translate(x, 0).toString();

function toggle(from: number, to: number, at: number): Keyframe[] {
  return [{ opacity: from }, { opacity: from, offset: Math.max(0, at - step) }, { opacity: to, offset: at }, { opacity: to }];
}

export function PhoneBook({ lang, phase, onPhase, coverPose, coverFace, onNavigate, onDismiss, reducedMotion = systemReducedMotion }: PhoneBookProps) {
  const ru = lang === "ru";
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLElement[]>([]);
  const tearingDown = useRef(false);
  const [page, setPage] = useState(0);
  const moving = phase === "opening" || phase === "closing";

  // The book is a modal surface on a phone: the page behind stays put and inert.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    tearingDown.current = false;
    if (!element.open) element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      tearingDown.current = true;
      document.body.style.overflow = previousOverflow;
      if (element.open) element.close();
    };
  }, []);

  /** The leaf is drawn at the cover's own size and scaled to the page. */
  const measure = useCallback(() => {
    const pose = coverPose();
    const trackElement = track.current;
    if (!pose || !trackElement) return null;
    const page = trackElement.getBoundingClientRect().height;
    trackElement.style.setProperty("--leaf-width", `${pose.width}px`);
    trackElement.style.setProperty("--leaf-height", `${pose.height}px`);
    trackElement.style.setProperty("--leaf-scale", `${page / pose.height}`);
    return pose;
  }, [coverPose]);

  useLayoutEffect(() => {
    if (!moving) return;
    const opening = phase === "opening";
    const finish = () => onPhase(opening ? "open" : "closed");
    const dialogElement = dialog.current;
    const scroller = viewport.current;
    const trackElement = track.current;
    const leafElement = leaf.current;
    const volume = trackElement?.firstElementChild;
    if (!dialogElement || !scroller || !trackElement || !leafElement || !(volume instanceof HTMLElement)) { finish(); return; }
    // Turning pages scrolls; the opening and closing move the track instead.
    const from = scroller.scrollLeft;
    scroller.dataset.moving = "";
    scroller.scrollLeft = 0;
    const pose = measure();
    const reduced = reducedMotion();
    const artwork = volume.querySelector<HTMLElement>("[data-book-artwork]");
    const leftPage = volume.querySelector<HTMLElement>('[data-book-page="left"]');
    const rightPage = volume.querySelector<HTMLElement>('[data-book-page="right"]');
    const [front, back] = Array.from(leafElement.children) as HTMLElement[];
    const [frontShade, backShade] = Array.from(leafElement.querySelectorAll<HTMLElement>("[data-shade]"));
    if (!pose || reduced || !artwork || !leftPage || !rightPage || !front || !back || !frontShade || !backShade) {
      delete scroller.dataset.moving;
      finish();
      return;
    }
    const running: Animation[] = [];
    const timers: number[] = [];
    const play = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = element.animate(keyframes, options);
      running.push(animation);
      return animation;
    };
    const trackRect = trackElement.getBoundingClientRect();
    const pageWidth = trackRect.width / 2;
    const closed = fromCover(pose, trackRect, pageWidth, trackRect.height);
    const chromeParts = chrome.current.filter(Boolean);
    dialogElement.dataset.fade = opening ? "in" : "out";

    if (opening) {
      const panFrom = (swingDelay + swing * 0.3) / opened;
      play(trackElement, [
        { transform: closed, easing: glideEasing },
        { transform: shift(-pageWidth), offset: glide / opened },
        { transform: shift(-pageWidth), offset: panFrom, easing: swingEasing },
        { transform: identity },
      ], { duration: opened });
      const landing = play(leafElement, [
        { transform: "rotateY(0deg)" },
        { transform: "rotateY(0deg)", offset: swingDelay / opened, easing: swingEasing },
        { transform: "rotateY(-180deg)" },
      ], { duration: opened, fill: "forwards" });
      for (const face of [front, back]) play(face, toggle(1, 0, 1), { duration: opened, fill: "forwards" });
      play(frontShade, [{ opacity: 0 }, { opacity: 0, offset: swingDelay / opened, easing: swingEasing }, { opacity: shadeDepth, offset: (swingDelay + swing / 2) / opened }, { opacity: shadeDepth }], { duration: opened });
      play(backShade, [{ opacity: shadeDepth }, { opacity: shadeDepth, offset: (swingDelay + swing / 2) / opened, easing: swingEasing }, { opacity: 0 }], { duration: opened });
      // Only the right page exists until the cover lands as the left one.
      artwork.style.clipPath = half;
      void landing.finished.then(() => { artwork.style.clipPath = ""; }, () => undefined);
      play(artwork, [{ opacity: 0 }, { opacity: 0, offset: swingDelay / opened }, { opacity: 1, offset: (swingDelay + 300) / opened }, { opacity: 1 }], { duration: opened });
      play(rightPage, [{ opacity: 0 }, { opacity: 0, offset: (swingDelay + 60) / opened }, { opacity: 1, offset: (swingDelay + 460) / opened }, { opacity: 1 }], { duration: opened });
      play(leftPage, [{ opacity: 0 }, { opacity: 0, offset: opened / (opened + unveil), easing: "ease-out" }, { opacity: 1 }], { duration: opened + unveil });
      for (const part of chromeParts) play(part, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: opened - 240, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
    } else {
      const fade = from > pageWidth / 2 ? 0 : 220;
      const shut = fade + swing;
      const total = shut - 160 + glide;
      for (const part of chromeParts) play(part, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in", fill: "forwards" });
      play(leftPage, [{ opacity: 1 }, { opacity: 0 }], { duration: Math.max(fade, 1), easing: "ease-in", fill: "forwards" });
      for (const face of [front, back]) play(face, toggle(0, 1, fade / total), { duration: total, fill: "forwards" });
      play(leafElement, [
        { transform: "rotateY(-180deg)" },
        { transform: "rotateY(-180deg)", offset: fade / total, easing: swingEasing },
        { transform: "rotateY(0deg)", offset: shut / total },
        { transform: "rotateY(0deg)" },
      ], { duration: total, fill: "forwards" });
      play(backShade, [{ opacity: 0 }, { opacity: 0, offset: fade / total, easing: swingEasing }, { opacity: shadeDepth, offset: (fade + swing / 2) / total }, { opacity: shadeDepth }], { duration: total, fill: "forwards" });
      play(frontShade, [{ opacity: shadeDepth }, { opacity: shadeDepth, offset: (fade + swing / 2) / total, easing: swingEasing }, { opacity: 0, offset: shut / total }, { opacity: 0 }], { duration: total, fill: "forwards" });
      timers.push(window.setTimeout(() => { artwork.style.clipPath = half; }, fade));
      play(artwork, [{ opacity: 1 }, { opacity: 1, offset: (shut - 160) / total }, { opacity: 0, offset: (shut + 120) / total }, { opacity: 0 }], { duration: total, fill: "forwards" });
      play(rightPage, [{ opacity: 1 }, { opacity: 1, offset: (shut - 260) / total }, { opacity: 0, offset: shut / total }, { opacity: 0 }], { duration: total, fill: "forwards" });
      // From the first page the view follows the cover back to the right-hand page.
      play(trackElement, [
        { transform: shift(-from) },
        { transform: shift(-from), offset: fade / total, easing: swingEasing },
        { transform: shift(-pageWidth), offset: (fade + swing * 0.7) / total },
        { transform: shift(-pageWidth), offset: (shut - 160) / total, easing: glideEasing },
        { transform: closed },
      ], { duration: total, fill: "forwards" });
    }
    let current = true;
    void Promise.all(running.map((animation) => animation.finished)).then(() => { if (current) finish(); }, () => undefined);
    return () => {
      current = false;
      for (const timer of timers) window.clearTimeout(timer);
      for (const animation of running) animation.cancel();
      artwork.style.clipPath = "";
      delete scroller.dataset.moving;
    };
  }, [phase, moving, measure, onPhase, reducedMotion]);

  useEffect(() => {
    if (phase !== "open") return;
    const element = viewport.current;
    if (!element) return;
    const update = () => setPage(element.scrollLeft > element.clientWidth / 2 ? 1 : 0);
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => element.removeEventListener("scroll", update);
  }, [phase]);

  const turnTo = (index: number) => {
    const element = viewport.current;
    if (!element) return;
    const reduced = reducedMotion();
    element.scrollTo({ left: index * element.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };
  const close = () => {
    if (phase === "open") onPhase("closing");
    else if (phase === "opening") onDismiss?.();
  };
  const pages = ru ? ["Оглавление", "Путеводитель"] : ["Contents", "Companion"];

  return <dialog ref={dialog} className={styles.dialog} aria-label={ru ? "Книга Gildra" : "The Gildra book"}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={(event) => { if (!tearingDown.current && !event.currentTarget.open && phase !== "closed") onDismiss?.(); }}>
    <div className={styles.layout}>
      <div className={styles.bar} ref={(element) => { if (element) chrome.current[0] = element; }}>
        <span>GILDRA · {ru ? "ХРОНИКИ АЗЕРОТА" : "CHRONICLES OF AZEROTH"}</span>
        <button type="button" className={styles.close} onClick={close} aria-label={ru ? "Закрыть книгу" : "Close the book"}><span aria-hidden="true">×</span></button>
      </div>
      <div ref={viewport} className={styles.viewport} data-page={page}>
        <div ref={track} className={styles.track} inert={moving}>
          <BookVolume lang={lang} active layout="spread" artworkSrc={phoneBookArtworkSrc} onNavigate={onNavigate} />
          <span className={styles.snap} aria-hidden="true" />
          <span className={styles.snap} aria-hidden="true" />
          <div className={leafStyles.leafMotion} hidden={!moving}>
            <div ref={leaf} className={leafStyles.leaf} aria-hidden="true">
              <div className={leafStyles.front}>
                <div className={leafStyles.cover} data-cover-awake={phase === "opening" || undefined}>{coverFace}</div>
                <span className={leafStyles.shade} data-shade />
              </div>
              <div className={leafStyles.back} style={{ backgroundImage: `url("${phoneBookArtworkSrc}")` } as CSSProperties}>
                <span className={leafStyles.shade} data-shade style={{ maskImage: `url("${phoneBookArtworkSrc}")`, WebkitMaskImage: `url("${phoneBookArtworkSrc}")` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <nav className={styles.pager} aria-label={ru ? "Страницы книги" : "Book pages"} ref={(element) => { if (element) chrome.current[1] = element; }}>
        {pages.map((label, index) => <button key={label} type="button" className={styles.tab} aria-current={page === index ? "page" : undefined}
          onClick={() => turnTo(index)} disabled={moving}>
          <small aria-hidden="true">{index ? "II" : "I"}</small>{label}
        </button>)}
      </nav>
    </div>
  </dialog>;
}
