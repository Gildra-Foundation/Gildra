import type { WowViewer } from "@/lib/wow/zamModelViewer";

/**
 * Studio-only handles on the Wowhead viewer beyond lib/wow/zamModelViewer.ts:
 * swap items on the loaded mannequin, play a pose, resize the drawing buffer
 * and take the viewer's own transparent screenshot. The upstream viewer has no
 * typed API, so every call is guarded and fails soft.
 */
type Actor = {
  setItems?: (items: Array<{ slot: number; display: number; visual: number }>) => void;
  clearSlots?: (slots: string) => void;
  setAnimation?: (name: string) => void;
  setAnimPaused?: (paused: boolean) => void;
};
type StudioRenderer = NonNullable<WowViewer["renderer"]> & {
  actors?: Actor[];
  options?: Record<string, unknown>;
  width?: number;
  height?: number;
  makeDataURL?: false | string[];
  screenshotDataURL?: string | null;
  screenshotCallback?: (() => void) | null;
  onResize?: (width: number, height: number, aspect: number) => void;
  setBackground?: (path: string) => void;
  clearBackground?: () => void;
  bgImgLoaded?: boolean;
};

const renderer = (viewer: WowViewer | null) => (viewer?.renderer ?? null) as StudioRenderer | null;
const actor = (viewer: WowViewer | null) => renderer(viewer)?.actors?.[0] ?? null;

export type ViewerItem = { slot: number; display: number };

/** Puts items on the loaded character without reloading the mannequin. */
export function setViewerItems(viewer: WowViewer | null, items: ViewerItem[]) {
  const target = actor(viewer);
  if (!target?.setItems || items.length === 0) return false;
  target.setItems(items.map((item) => ({ slot: item.slot, display: item.display, visual: 0 })));
  return true;
}

/** Takes items off viewer slots (hidden or emptied doll slots). */
export function clearViewerSlots(viewer: WowViewer | null, slots: number[]) {
  const target = actor(viewer);
  if (!target?.clearSlots || slots.length === 0) return false;
  target.clearSlots(slots.join(","));
  return true;
}

export function setViewerPose(viewer: WowViewer | null, pose: string) {
  actor(viewer)?.setAnimation?.(pose);
}

export function pauseViewer(viewer: WowViewer | null, paused: boolean) {
  for (const entry of renderer(viewer)?.actors ?? []) entry.setAnimPaused?.(paused);
}

/** Resizes the drawing buffer (the viewer ignores devicePixelRatio). */
export function resizeViewer(viewer: WowViewer | null, width: number, height: number) {
  const target = renderer(viewer);
  if (!target?.onResize || width < 1 || height < 1) return;
  target.onResize(Math.round(width), Math.round(height), width / height);
}

/**
 * Draws an image (blob or same-origin URL) as the viewer's own background, or
 * removes it. The viewer prefixes its contentPath to the path, so the prefix
 * is blanked for the call (it reads it synchronously) and restored at once.
 */
export function setViewerBackground(viewer: WowViewer | null, url: string | null) {
  const target = renderer(viewer);
  if (!target) return;
  if (!url) {
    target.clearBackground?.();
    if (target.options) delete target.options.background;
    return;
  }
  if (!target.setBackground || !target.options) return;
  const contentPath = target.options.contentPath;
  target.options.contentPath = "";
  try {
    target.setBackground(url);
  } finally {
    target.options.contentPath = contentPath;
  }
}

export function viewerSize(viewer: WowViewer | null) {
  const target = renderer(viewer);
  return { width: target?.width ?? 0, height: target?.height ?? 0 };
}

const frame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

/**
 * The viewer's screenshot at width × height: it draws the next frame on black
 * and on white and derives real alpha from the difference, so the model comes
 * out on a transparent background. The display size is restored afterwards.
 */
export async function captureViewer(viewer: WowViewer | null, width: number, height: number): Promise<HTMLImageElement> {
  const target = renderer(viewer);
  if (!target || target.makeDataURL === undefined) throw new Error("viewer screenshot unavailable");
  const before = viewerSize(viewer);
  const options = target.options ?? {};
  const wasTransparent = options.transparent;
  options.transparent = true;
  try {
    resizeViewer(viewer, width, height);
    await frame();
    await frame();
    const url = await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("viewer screenshot timed out")), 8_000);
      target.screenshotCallback = () => {
        window.clearTimeout(timer);
        const data = target.screenshotDataURL;
        if (data) resolve(data);
        else reject(new Error("viewer screenshot is empty"));
      };
      target.makeDataURL = ["image/png"];
    });
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    options.transparent = wasTransparent;
    if (before.width && before.height) resizeViewer(viewer, before.width, before.height);
  }
}
