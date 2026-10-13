import type { CoverPose } from "../home/HomeBook";

// Every moving layer animates only transform and opacity, so the compositor can
// keep the motion smooth while React mounts the contents and fetches the account.
const glide = 720;
const swingDelay = 360;
const swing = 1100;
const opened = swingDelay + swing;
const unveil = 360;
const settle = 220;
// Starts and ends at rest: no jump when the cover leaves the page or lands back.
const glideEasing = "cubic-bezier(.4,0,.2,1)";
const swingEasing = "cubic-bezier(.42,0,.18,1)";
const identity = "matrix(1, 0, 0, 1, 0, 0)";
const shadeDepth = 0.55;
// A discrete switch inside one keyframe step.
const step = 0.001;

/** Maps a cover-sized region of an element onto the closed cover drawn on the page. */
function fromCover(pose: CoverPose, element: DOMRect, regionLeft: number, regionHeight: number) {
  const scale = pose.height / regionHeight;
  return new DOMMatrix().translate(-element.left, -element.top).multiply(pose.visual)
    .translate(pose.x - scale * regionLeft, pose.y).scale(scale).toString();
}

/** Opacity that jumps from one value to another at `at` (0–1 of the animation). */
function toggle(from: number, to: number, at: number): Keyframe[] {
  return [{ opacity: from }, { opacity: from, offset: Math.max(0, at - step) }, { opacity: to, offset: at }, { opacity: to }];
}

export type BookCoverMotionOptions = {
  book: HTMLElement;
  leaf: HTMLElement;
  actions: HTMLElement;
  pose: CoverPose;
  opening: boolean;
  onFinish: () => void;
  reducedMotion?: boolean;
};

/** Shared cover glide and opening swing used by the home scene and contents. */
export function animateBookCover({
  book: bookElement,
  leaf: leafElement,
  actions: actionsElement,
  pose,
  opening,
  onFinish: finish,
  reducedMotion,
}: BookCoverMotionOptions): () => void {
  const volume = bookElement.firstElementChild;
  if (!(volume instanceof HTMLElement)
    || (reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    finish();
    return () => undefined;
  }
  const artwork = volume.querySelector<HTMLElement>("[data-book-artwork]");
  const leftPage = volume.querySelector<HTMLElement>('[data-book-page="left"]');
  const rightPage = volume.querySelector<HTMLElement>('[data-book-page="right"]');
  const [front, back] = Array.from(leafElement.children) as HTMLElement[];
  const [frontShade, backShade] = Array.from(leafElement.querySelectorAll<HTMLElement>("[data-shade]"));
  if (!artwork || !leftPage || !rightPage || !front || !back || !frontShade || !backShade) {
    finish();
    return () => undefined;
  }
  const running: Animation[] = [];
  const clipped: HTMLElement[] = [];
  const timers: number[] = [];
  const play = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(keyframes, options);
    running.push(animation);
    return animation;
  };
  if (opening) {
    const bookRect = bookElement.getBoundingClientRect();
    const half = "inset(0 0 0 50%)";
    const swingStart = swingDelay / opened;
    const swingMiddle = (swingDelay + swing / 2) / opened;
    play(bookElement, [{ transform: fromCover(pose, bookRect, bookRect.width / 2, bookRect.height) }, { transform: identity }], { duration: glide, easing: glideEasing });
    const landing = play(leafElement, [
      { transform: "rotateY(0deg)" },
      { transform: "rotateY(0deg)", offset: swingStart, easing: swingEasing },
      { transform: "rotateY(-180deg)" },
    ], { duration: opened, fill: "forwards" });
    void landing.finished.then(() => { artwork.style.clipPath = ""; }, () => undefined);
    // The landed cover hands over to the identical left page underneath.
    for (const face of [front, back]) play(face, toggle(1, 0, 1), { duration: opened, fill: "forwards" });
    play(frontShade, [{ opacity: 0 }, { opacity: 0, offset: swingStart, easing: swingEasing }, { opacity: shadeDepth, offset: swingMiddle }, { opacity: shadeDepth }], { duration: opened });
    play(backShade, [{ opacity: shadeDepth }, { opacity: shadeDepth, offset: swingMiddle, easing: swingEasing }, { opacity: 0 }], { duration: opened });
    // Only the right page exists until the cover lands as the left one. A static
    // clip (not an animated one) keeps the large artwork from repainting every frame.
    artwork.style.clipPath = half;
    clipped.push(artwork);
    play(artwork, [{ opacity: 0 }, { opacity: 0, offset: swingStart }, { opacity: 1, offset: (swingDelay + 300) / opened }, { opacity: 1 }], { duration: opened });
    play(rightPage, [{ opacity: 0 }, { opacity: 0, offset: (swingDelay + 60) / opened }, { opacity: 1, offset: (swingDelay + 460) / opened }, { opacity: 1 }], { duration: opened });
    play(leftPage, [{ opacity: 0 }, { opacity: 0, offset: opened / (opened + unveil), easing: "ease-out" }, { opacity: 1 }], { duration: opened + unveil });
    play(actionsElement, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 440, delay: opened - 220, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
  } else {
    const bookRect = bookElement.getBoundingClientRect();
    const half = "inset(0 0 0 50%)";
    const fade = 220;
    const shut = fade + swing;
    const total = shut - settle + glide;
    play(actionsElement, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: "ease-in", fill: "forwards" });
    play(leftPage, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: "ease-in", fill: "forwards" });
    for (const face of [front, back]) play(face, toggle(0, 1, fade / shut), { duration: shut, fill: "forwards" });
    play(leafElement, [
      { transform: "rotateY(-180deg)" },
      { transform: "rotateY(-180deg)", offset: fade / shut, easing: swingEasing },
      { transform: "rotateY(0deg)" },
    ], { duration: shut, fill: "forwards" });
    play(backShade, [{ opacity: 0 }, { opacity: 0, offset: fade / shut, easing: swingEasing }, { opacity: shadeDepth, offset: (fade + swing / 2) / shut }, { opacity: shadeDepth }], { duration: shut, fill: "forwards" });
    play(frontShade, [{ opacity: shadeDepth }, { opacity: shadeDepth, offset: (fade + swing / 2) / shut, easing: swingEasing }, { opacity: 0 }], { duration: shut, fill: "forwards" });
    const clip = window.setTimeout(() => { artwork.style.clipPath = half; }, fade);
    clipped.push(artwork);
    timers.push(clip);
    play(artwork, [{ opacity: 1 }, { opacity: 1, offset: (shut - 160) / total }, { opacity: 0, offset: (shut + 120) / total }, { opacity: 0 }], { duration: total, fill: "forwards" });
    play(rightPage, [{ opacity: 1 }, { opacity: 1, offset: (shut - 260) / total }, { opacity: 0, offset: shut / total }, { opacity: 0 }], { duration: total, fill: "forwards" });
    play(bookElement, [
      { transform: identity },
      { transform: identity, offset: (shut - settle) / total, easing: glideEasing },
      { transform: fromCover(pose, bookRect, bookRect.width / 2, bookRect.height) },
    ], { duration: total, fill: "forwards" });
  }
  let current = true;
  void Promise.all(running.map((animation) => animation.finished)).then(() => { if (current) finish(); }, () => undefined);
  return () => {
    current = false;
    for (const timer of timers) window.clearTimeout(timer);
    for (const animation of running) animation.cancel();
    for (const element of clipped) element.style.clipPath = "";
  };
}
