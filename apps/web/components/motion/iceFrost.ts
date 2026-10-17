import { iceRandom, type IcePoint } from "./iceFracture";

/** Generate crystalline hoarfrost once; animate only a small growth mask. */
export function createIceFrost(width: number, height: number) {
  const scale = Math.min(1, 1400 / Math.max(width, height));
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
  const texture = document.createElement("canvas");
  texture.width = w; texture.height = h;
  const paint = texture.getContext("2d");
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext("2d");
  const mask = document.createElement("canvas");
  mask.width = Math.max(32, Math.ceil(w / 8)); mask.height = Math.max(32, Math.ceil(h / 8));
  const maskContext = mask.getContext("2d");
  if (!paint || !context || !maskContext) return null;
  const random = iceRandom(491);
  const grain = paint.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      const edge = 1 - Math.min(x / w, (w - x) / w, y / h, (h - y) / h) * 2;
      const cloud = Math.sin(x * .018 + Math.sin(y * .012) * 2) * Math.cos(y * .023 + x * .007);
      const sparkle = random();
      grain.data[offset] = 183 + sparkle * 44;
      grain.data[offset + 1] = 220 + sparkle * 28;
      grain.data[offset + 2] = 241 + sparkle * 14;
      grain.data[offset + 3] = 54 + edge ** 2 * 112 + cloud * 22 + sparkle * 24;
    }
  }
  paint.putImageData(grain, 0, 0);
  // Feathered, branching crystals, with smaller needles on every side branch.
  const fern = (x: number, y: number, angle: number, length: number, depth: number) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    paint.moveTo(x, y); paint.lineTo(x + dx * length, y + dy * length);
    if (!depth) return;
    for (let step = 1; step < 7; step++) {
      const t = step / 7;
      for (const side of [-1, 1]) {
        fern(x + dx * length * t, y + dy * length * t, angle + side * (.55 + random() * .2), length * (1 - t) * .48, depth - 1);
      }
    }
  };
  paint.lineWidth = .65 * scale;
  paint.strokeStyle = "rgba(244,253,255,.55)";
  paint.beginPath();
  const crystalCount = Math.round(w * h / 2300);
  for (let index = 0; index < crystalCount; index++) {
    const x = random() * w, y = random() * h;
    const edge = Math.min(x / w, 1 - x / w, y / h, 1 - y / h);
    fern(x, y, random() * Math.PI * 2, (16 + random() * 66) * scale * (1.2 - edge), 2);
  }
  paint.stroke();
  const growth = maskContext.createImageData(mask.width, mask.height);
  const arrival = new Float32Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const u = x / (mask.width - 1), v = y / (mask.height - 1);
      const edge = Math.min(u, 1 - u, v, 1 - v) * 2;
      const ripple = Math.sin(u * 29 + Math.sin(v * 17) * 2) * .065 + Math.sin(v * 41 + u * 19) * .035;
      arrival[y * mask.width + x] = Math.max(0, edge + ripple + random() * .045);
    }
  }
  const urls: string[] = [];
  return {
    canvas,
    dispose() { urls.forEach(url => URL.revokeObjectURL(url)); },
    draw(progress: number) {
      context.clearRect(0, 0, w, h);
      context.drawImage(texture, 0, 0);
      if (progress >= 1) return;
      for (let index = 0; index < arrival.length; index++) {
        growth.data[index * 4 + 3] = Math.max(0, Math.min(1, (progress * 1.26 - arrival[index]) * 9)) * 255;
      }
      maskContext.putImageData(growth, 0, 0);
      context.globalCompositeOperation = "destination-in";
      context.drawImage(mask, 0, 0, w, h);
      context.globalCompositeOperation = "source-over";
    },
    skin(cracks?: { points: IcePoint[]; fine?: boolean }[]) {
      if (cracks) {
        // The same fracture edges travel with their respective frozen fragments.
        for (const [colour, lineWidth] of [["rgba(15,54,76,.65)", 3], ["rgba(232,251,255,.95)", 1]] as const) {
          paint.strokeStyle = colour;
          for (const { points, fine } of cracks) {
            paint.lineWidth = lineWidth * scale * (fine ? .45 : 1);
            paint.beginPath();
            points.forEach(([x, y], index) => {
              if (!index) paint.moveTo(x * scale, y * scale);
              else paint.lineTo(x * scale, y * scale);
            });
            paint.stroke();
          }
        }
      }
      // Blob URLs keep the shared CSS value small even on large displays.
      // A noisy transparent PNG can exceed the browser's custom-property limit.
      const encoded = texture.toDataURL().split(",")[1];
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      urls.push(url);
      return `url("${url}")`;
    },
  };
}
