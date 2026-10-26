import type { BackgroundDef } from "./model";

/**
 * Builds the export picture in a 2D canvas: background (none, color, gradient
 * or one of the site's scenes), a soft floor shadow, the model the viewer
 * rendered on a transparent background, the caption and the gildra.net mark.
 * Every source is same-origin or a data URL, so the canvas stays exportable.
 */
export type ComposeOptions = {
  width: number;
  height: number;
  background: BackgroundDef;
  model: HTMLImageElement;
  brightness: number; // 1 = as rendered
  contrast: number;
  shadow: number; // 0…1
  title: string;
  subtitle: string;
  mark: boolean;
  displayFont: string; // resolved font-family list of the site's display face
  uiFont: string;
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`background ${src} did not load`));
  image.src = src;
});

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, position: string) {
  const [px, py] = position.split(" ").map((part) => Number.parseFloat(part) / 100);
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) * (Number.isFinite(px) ? px : 0.5), (height - drawHeight) * (Number.isFinite(py) ? py : 0.5), drawWidth, drawHeight);
}

/** Bounding box of the opaque model pixels, to place the floor shadow under the feet. */
export function modelBounds(model: HTMLImageElement) {
  const probe = document.createElement("canvas");
  const scale = Math.min(1, 320 / Math.max(model.naturalWidth, model.naturalHeight));
  probe.width = Math.max(1, Math.round(model.naturalWidth * scale));
  probe.height = Math.max(1, Math.round(model.naturalHeight * scale));
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(model, 0, 0, probe.width, probe.height);
  const { data } = context.getImageData(0, 0, probe.width, probe.height);
  let left = probe.width, right = -1, top = probe.height, bottom = -1;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (data[(y * probe.width + x) * 4 + 3] > 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left: left / probe.width, right: (right + 1) / probe.width, top: top / probe.height, bottom: (bottom + 1) / probe.height };
}

/** Paints a background (with the scene vignette) over the whole canvas. Transparent paints nothing. */
export async function paintBackground(context: CanvasRenderingContext2D, background: BackgroundDef, width: number, height: number) {
  if (background.kind === "color") {
    context.fillStyle = background.color;
    context.fillRect(0, 0, width, height);
  } else if (background.kind === "gradient") {
    const radians = (background.angle - 90) * Math.PI / 180;
    const half = Math.abs(width * Math.cos(radians)) / 2 + Math.abs(height * Math.sin(radians)) / 2;
    const cx = width / 2, cy = height / 2;
    const gradient = context.createLinearGradient(cx - Math.cos(radians) * half, cy - Math.sin(radians) * half, cx + Math.cos(radians) * half, cy + Math.sin(radians) * half);
    gradient.addColorStop(0, background.stops[0]);
    gradient.addColorStop(1, background.stops[1]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (background.kind === "scene") {
    drawCover(context, await loadImage(background.src), width, height, background.position);
    // A quiet vignette keeps the model in front of busy paintings.
    const vignette = context.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.2, width / 2, height * 0.55, Math.max(width, height) * 0.75);
    vignette.addColorStop(0, "rgba(5, 8, 12, 0)");
    vignette.addColorStop(1, "rgba(5, 8, 12, 0.55)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }
}

/** Soft elliptical floor shadow centred at (x, y). */
export function paintFloorShadow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, strength: number) {
  if (strength <= 0 || radius <= 0) return;
  context.save();
  context.translate(x, y);
  context.scale(1, 0.18);
  const shadow = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  shadow.addColorStop(0, `rgba(0, 0, 0, ${0.75 * strength})`);
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = shadow;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Background of the live stage as an image for the viewer: drawn inside WebGL,
 * additive effects (glows, particles) blend onto it as in the game instead of
 * turning into dark boxes over a transparent canvas. The floor shadow sits where
 * the default camera puts the feet.
 */
export async function stageBackgroundURL(background: BackgroundDef, width: number, height: number, shadow: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  await paintBackground(context, background, canvas.width, canvas.height);
  paintFloorShadow(context, canvas.width / 2, canvas.height * STAGE_FEET_Y, canvas.height * 0.17, shadow);
  const blob = await canvasBlob(canvas, "image/png");
  return URL.createObjectURL(blob);
}

/** Height of the feet in the stage frame at the default camera, 0…1 from the top. */
export const STAGE_FEET_Y = 0.93;

export async function composeFrame(options: ComposeOptions): Promise<HTMLCanvasElement> {
  const { width, height, background } = options;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  const unit = Math.min(width, height) / 1080;

  // Background, shadow and model form one layer: light (brightness, contrast)
  // tones the whole picture, exactly as the stage preview does.
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const scene = layer.getContext("2d");
  if (!scene) throw new Error("2D canvas unavailable");
  await paintBackground(scene, background, width, height);

  const bounds = modelBounds(options.model);
  if (bounds) {
    paintFloorShadow(scene, (bounds.left + bounds.right) / 2 * width, bounds.bottom * height, (bounds.right - bounds.left) * width * 0.55, options.shadow);
  }
  scene.drawImage(options.model, 0, 0, width, height);
  context.filter = `brightness(${options.brightness}) contrast(${options.contrast})`;
  context.drawImage(layer, 0, 0);
  context.filter = "none";

  const pad = 64 * unit;
  if (options.title || options.subtitle) {
    if (background.kind !== "transparent") {
      const fade = context.createLinearGradient(0, height * 0.62, 0, height);
      fade.addColorStop(0, "rgba(5, 8, 12, 0)");
      fade.addColorStop(1, "rgba(5, 8, 12, 0.62)");
      context.fillStyle = fade;
      context.fillRect(0, height * 0.62, width, height * 0.38);
    }
    context.textBaseline = "alphabetic";
    context.shadowColor = "rgba(0, 0, 0, 0.75)";
    context.shadowBlur = 12 * unit;
    context.shadowOffsetY = 2 * unit;
    let baseline = height - pad;
    if (options.title) {
      context.fillStyle = "#f2f6fa";
      context.font = `600 ${Math.round(64 * unit)}px ${options.displayFont}`;
      fitText(context, options.title, width - pad * 2 - (options.mark ? 220 * unit : 0));
      context.fillText(options.title, pad, baseline, width - pad * 2);
      baseline -= 78 * unit;
    }
    if (options.subtitle) {
      context.fillStyle = "#e7d7ae";
      context.font = `600 ${Math.round(22 * unit)}px ${options.uiFont}`;
      context.letterSpacing = `${(3 * unit).toFixed(1)}px`;
      context.fillText(options.subtitle.toUpperCase(), pad, options.title ? baseline + 8 * unit : baseline, width - pad * 2);
      context.letterSpacing = "0px";
    }
  }
  if (options.mark) {
    context.shadowColor = "rgba(0, 0, 0, 0.6)";
    context.shadowBlur = 8 * unit;
    context.fillStyle = "rgba(242, 246, 250, 0.78)";
    context.font = `600 ${Math.round(18 * unit)}px ${options.uiFont}`;
    context.letterSpacing = `${(2.5 * unit).toFixed(1)}px`;
    context.textAlign = "right";
    context.fillText("GILDRA.NET", width - pad, height - pad);
    context.textAlign = "left";
    context.letterSpacing = "0px";
  }
  return canvas;
}

/** Shrinks the current font until text fits maxWidth. */
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const match = /(\d+)px/.exec(context.font);
  let size = match ? Number(match[1]) : 48;
  while (size > 12 && context.measureText(text).width > maxWidth) {
    size -= 2;
    context.font = context.font.replace(/\d+px/, `${size}px`);
  }
}

export function canvasBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/webp") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export failed"))), type, type === "image/webp" ? 0.92 : undefined);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
