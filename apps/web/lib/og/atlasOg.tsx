import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

/**
 * Open Graph card of an atlas page, after the "photo" block of ogimagecn
 * (https://github.com/shadcn-labs/ogimagecn): the page's scene fills the card,
 * a dark veil on the left carries the eyebrow, the title, an ornament and the
 * key facts, embers glow over the art. Rendered with next/og (Satori) at build
 * time; fonts and artwork come from public/ (copied into the image).
 */
export type AtlasOgSpec = {
  locale: "en" | "ru";
  /** Public path of the scene (webp/jpg/png). */
  art: string;
  /** Focus of the crop, 0–1 on each axis (default centre, upper third). */
  focus?: [number, number];
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Short facts in one row ("6 encounters", "Season 1"). */
  facts?: string[];
  /** Public path of a square identity icon (spec, class). */
  emblem?: string;
};

export const OG_SIZE = { width: 1200, height: 630 };

const palette = {
  bg: "#050607",
  text: "#f2e1c3",
  body: "#d9d0c0",
  muted: "#aaa294",
  accent: "#d1a24b",
  accentStrong: "#f0b55a",
};

const publicFile = (path: string) => join(process.cwd(), "public", path.replace(/^\//, ""));

const fonts = Promise.all([
  readFile(publicFile("/assets/og/fonts/alegreya-500.ttf")),
  readFile(publicFile("/assets/og/fonts/inter-400.ttf")),
  readFile(publicFile("/assets/og/fonts/inter-600.ttf")),
]).then(([display, ui, uiStrong]) => [
  { name: "Alegreya", data: display, weight: 500 as const, style: "normal" as const },
  { name: "Inter", data: ui, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: uiStrong, weight: 600 as const, style: "normal" as const },
]);

/** The scene cropped to the card around its focus, as a JPEG data URL (Satori does not read WebP). */
async function sceneDataUrl(path: string, [fx, fy]: [number, number]) {
  const file = publicFile(path);
  const meta = await sharp(file).metadata();
  const width = meta.width ?? OG_SIZE.width;
  const height = meta.height ?? OG_SIZE.height;
  const scale = Math.max(OG_SIZE.width / width, OG_SIZE.height / height);
  const scaledWidth = Math.ceil(width * scale);
  const scaledHeight = Math.ceil(height * scale);
  const buffer = await sharp(file)
    .resize(scaledWidth, scaledHeight)
    .extract({
      left: Math.round((scaledWidth - OG_SIZE.width) * fx),
      top: Math.round((scaledHeight - OG_SIZE.height) * fy),
      width: OG_SIZE.width,
      height: OG_SIZE.height,
    })
    .modulate({ saturation: 0.92 })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function iconDataUrl(path: string) {
  const buffer = await sharp(publicFile(path)).resize(112, 112).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// Embers over the scene: x, y, radius, opacity.
const embers: [number, number, number, number][] = [
  [820, 120, 3, 0.9], [905, 210, 2, 0.7], [1010, 95, 2.5, 0.8], [1090, 260, 2, 0.6], [760, 300, 2, 0.55],
  [960, 360, 3, 0.75], [1130, 150, 2, 0.65], [870, 455, 2, 0.5], [1040, 480, 2.5, 0.6], [700, 190, 1.5, 0.5],
];

function titleSize(title: string) {
  if (title.length <= 16) return 92;
  if (title.length <= 26) return 78;
  if (title.length <= 36) return 64;
  return 54;
}

/** The card as a JPEG: the painted scene compresses ~7× better than the PNG Satori renders. */
export async function atlasOgImage(spec: AtlasOgSpec) {
  const jpeg = buildCacheDir ? await cachedJpeg(spec) : await renderJpeg(spec);
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}

async function renderJpeg(spec: AtlasOgSpec) {
  const png = await (await renderPng(spec)).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/**
 * A card is a pure function of its spec, art, fonts and this renderer (two
 * builds draw byte-identical cards), yet drawing one costs ~1.6 CPU-seconds
 * (Satori blurs, mozjpeg): the 322 cards were ~80 % of `next build`. During the
 * build each card is kept in .next/cache/og under a hash of all of that, so a
 * rebuild draws only cards whose inputs changed (the Docker build keeps
 * .next/cache in a cache mount). Bump the version to discard every card.
 */
const OG_CACHE_VERSION = 1;
const buildCacheDir =
  process.env.NEXT_PHASE === "phase-production-build" ? join(process.cwd(), ".next/cache/og") : null;

// Build-time reads only: keep them out of the standalone trace.
const fileHash = (path: string) => readFile(/* turbopackIgnore: true */ path).then((data) => createHash("sha256").update(data).digest("hex"));

let rendererHash: Promise<string> | undefined;
function renderer() {
  rendererHash ??= Promise.all([
    ...["/assets/og/fonts/alegreya-500.ttf", "/assets/og/fonts/inter-400.ttf", "/assets/og/fonts/inter-600.ttf"].map((font) => fileHash(publicFile(font))),
    // Satori/resvg ship inside next and the encoders inside sharp: any dependency change redraws every card.
    fileHash(join(process.cwd(), "../../package-lock.json")),
  ]).then((files) =>
    createHash("sha256")
      .update(JSON.stringify({ OG_CACHE_VERSION, files, palette, embers, OG_SIZE, sharp: sharp.versions }))
      .update([renderJpeg, renderPng, sceneDataUrl, iconDataUrl, titleSize].map(String).join("\n"))
      .digest("hex"),
  );
  return rendererHash;
}

async function cachedJpeg(spec: AtlasOgSpec) {
  const [code, art, emblem] = await Promise.all([renderer(), fileHash(publicFile(spec.art)), spec.emblem ? fileHash(publicFile(spec.emblem)) : null]);
  const key = createHash("sha256").update(JSON.stringify({ code, art, emblem, spec })).digest("hex");
  const file = join(buildCacheDir!, `${key}.jpg`);
  const cached = await readFile(/* turbopackIgnore: true */ file).catch(() => null);
  if (cached) return cached;
  const jpeg = await renderJpeg(spec);
  await mkdir(/* turbopackIgnore: true */ buildCacheDir!, { recursive: true });
  const partial = `${file}.${process.pid}.tmp`;
  await writeFile(/* turbopackIgnore: true */ partial, jpeg);
  await rename(/* turbopackIgnore: true */ partial, file);
  return jpeg;
}

async function renderPng(spec: AtlasOgSpec) {
  const [fontList, scene, emblem] = await Promise.all([
    fonts,
    sceneDataUrl(spec.art, spec.focus ?? [0.5, 0.3]),
    spec.emblem ? iconDataUrl(spec.emblem) : Promise.resolve(null),
  ]);

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: palette.bg, color: palette.text, fontFamily: "Inter" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
        <img src={scene} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(4,5,6,.96) 0%, rgba(4,5,6,.84) 40%, rgba(4,5,6,.3) 72%, rgba(4,5,6,.5) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(4,5,6,.35) 0%, rgba(4,5,6,0) 30%, rgba(4,5,6,0) 70%, rgba(4,5,6,.6) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", backgroundImage: "radial-gradient(circle at 78% 18%, rgba(230,172,77,.22), rgba(230,172,77,0) 42%)" }} />
        {embers.map(([x, y, r, opacity]) => (
          <div key={`${x}-${y}`} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, display: "flex", borderRadius: r, background: "#ffd08a", opacity, boxShadow: `0 0 ${r * 6}px ${r * 2}px rgba(255,150,60,.55)` }} />
        ))}

        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "52px 72px 58px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div style={{ display: "flex", fontFamily: "Alegreya", fontSize: 30, letterSpacing: 7, color: palette.text }}>GILDRA</div>
            <div style={{ display: "flex", fontSize: 15, fontWeight: 600, letterSpacing: 3.5, color: palette.muted }}>WORLD OF WARCRAFT</div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 32, maxWidth: 860 }}>
            {emblem ? (
              // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
              <img src={emblem} alt="" width={112} height={112} style={{ flexShrink: 0, borderRadius: 56, border: `3px solid ${palette.accent}`, boxShadow: "0 0 0 6px rgba(0,0,0,.7), 0 0 36px rgba(230,172,77,.35)", marginBottom: 10 }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {spec.eyebrow ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, color: palette.accent, fontSize: 20, fontWeight: 600, letterSpacing: 3.2, textTransform: "uppercase" }}>
                  <div style={{ display: "flex", width: 34, height: 2, backgroundImage: `linear-gradient(90deg, rgba(209,162,75,0), ${palette.accent})` }} />
                  {spec.eyebrow}
                </div>
              ) : null}
              <div style={{ display: "flex", marginTop: 14, fontFamily: "Alegreya", fontSize: titleSize(spec.title), lineHeight: 1.04, letterSpacing: -1, color: palette.text, textShadow: "0 3px 12px rgba(0,0,0,.85)" }}>
                {spec.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
                <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: palette.accentStrong, boxShadow: "0 0 12px rgba(240,181,90,.8)" }} />
                <div style={{ display: "flex", width: 150, height: 2, backgroundImage: `linear-gradient(90deg, ${palette.accent}, rgba(209,162,75,0))` }} />
              </div>
              {spec.subtitle ? (
                <div style={{ display: "flex", marginTop: 18, maxWidth: 760, fontSize: 26, lineHeight: 1.4, color: palette.body, lineClamp: 2 }}>{spec.subtitle}</div>
              ) : null}
              {spec.facts?.length ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, fontSize: 21, fontWeight: 600, color: palette.accentStrong }}>
                  {spec.facts.map((fact, index) => (
                    <div key={fact} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {index ? <div style={{ display: "flex", width: 5, height: 5, borderRadius: 3, background: palette.muted }} /> : null}
                      {fact}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", height: 5, backgroundImage: `linear-gradient(90deg, ${palette.accent}, rgba(240,181,90,.9) 40%, rgba(209,162,75,0))` }} />
      </div>
    ),
    { ...OG_SIZE, fonts: fontList },
  );
}
