import { rasterHostReady, renderPageRaster } from "./pageRasterHost";

// Only same-origin static asset bytes are reused. Page contents and private
// images live for one transition. The cache holds at most 4M base64 characters.
const assets = new Map<string, { promise: Promise<string>; chars: number }>();
let cachedChars = 0;
const MAX_EDGE = 1024;
const URL_PATTERN = /url\(["']?([^"')]+)["']?\)/g;
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const dataURL = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
  reader.readAsDataURL(blob);
});
let imageJobs = 0;
const imageQueue: (() => void)[] = [];
async function compactImage(blob: Blob, signal: AbortSignal) {
  if (!blob.type.startsWith("image/") || blob.type.includes("svg")) return blob;
  await new Promise<void>(resolve => {
    const run = () => { imageJobs++; resolve(); };
    if (imageJobs < 2) run(); else imageQueue.push(run);
  });
  let bitmap: ImageBitmap | undefined;
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    // Decode large artwork asynchronously before embedding it in the SVG.
    // Otherwise the SVG's first paint synchronously decodes those images again.
    bitmap = await createImageBitmap(blob);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1 && !blob.type.includes("avif")) return blob;
    const canvas = new OffscreenCanvas(Math.ceil(bitmap.width * ratio), Math.ceil(bitmap.height * ratio));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/webp", quality: .88 });
  } finally { bitmap?.close(); imageJobs--; imageQueue.shift()?.(); }
}
function asset(url: string, signal: AbortSignal) {
  if (url.startsWith("data:")) return Promise.resolve(url);
  const parsed = new URL(url, document.baseURI), absolute = parsed.href;
  const reusable = parsed.origin === location.origin && /^\/(assets\/|_next\/static\/)/.test(parsed.pathname);
  const cached = reusable ? assets.get(absolute) : undefined;
  if (cached) return cached.promise;
  const promise = fetch(absolute, { cache: "force-cache", signal }).then(response => {
      if (!response.ok) throw new Error("snapshot asset unavailable");
      return response.blob();
    }).then(async blob => {
      if (blob.size > 2_000_000) throw new Error("snapshot asset too large");
      return dataURL(await compactImage(blob, signal));
    });
  if (reusable) {
    const entry = { promise, chars: 0 }; assets.set(absolute, entry);
    void promise.then(value => {
      if (assets.get(absolute) !== entry) return;
      entry.chars = value.length; cachedChars += entry.chars;
      while (cachedChars > 4_000_000 || assets.size > 24) {
        const oldest = assets.keys().next().value!;
        cachedChars -= assets.get(oldest)!.chars; assets.delete(oldest);
      }
    }).catch(() => { if (assets.get(absolute) === entry) { cachedChars -= entry.chars; assets.delete(absolute); } });
  }
  return promise;
}
const normalise = (value: string) => value.replace(/["'\s]/g, "").toLowerCase();

/** One bounded, transient raster shared by all shards. Reuse the loaded CSS,
 * rather than reading hundreds of computed properties for every element. The
 * viewport copy is already inert and excludes offscreen list descendants.
 */
export async function pageRaster(source: HTMLElement, signal: AbortSignal): Promise<ImageBitmap> {
  const started = performance.now();
  const check = () => { if (signal.aborted || !source.isConnected) throw new DOMException("Cancelled", "AbortError"); };
  check();
  await rasterHostReady();
  await yieldTask();
  check();
  const width = innerWidth, height = innerHeight, scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const urls = new Set<string>(), cssURLs = new Set<string>(), fonts: string[] = [], sheets: string[] = [];
  const classes = new Set<string>();
  for (const element of [source, ...source.querySelectorAll("*")]) for (const name of element.classList) classes.add(name);
  for (let ancestor = source.parentElement; ancestor; ancestor = ancestor.parentElement) for (const name of ancestor.classList) classes.add(name);
  const relevant = (selector: string) => selector.split(",").some(branch => {
    if (/:(is|where|not|has)\(/.test(branch)) return true;
    return Array.from(branch.matchAll(/\.([_a-zA-Z][_a-zA-Z0-9-]*)/g)).every(match => classes.has(match[1]));
  });
  const collectURLs = (value: string, base = document.baseURI, cssAsset = true) => {
    for (const match of value.matchAll(URL_PATTERN)) if (!/^(#|data:)/.test(match[1])) {
      const url = new URL(match[1], base);
      if (url.hash && url.href.split("#")[0] === location.href.split("#")[0]) continue;
      urls.add(url.href);
      if (cssAsset) cssURLs.add(url.href);
    }
  };
  const loadedFaces = new Set(Array.from(document.fonts).filter(face => face.status === "loaded").map(face => normalise(`${face.family}|${face.weight}|${face.style}|${face.unicodeRange}`)));
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll("*")], copies = [clone, ...clone.querySelectorAll("*")];
  const families = new Set<string>();
  let slice = performance.now();
  for (let index = 0; index < originals.length; index++) {
    check();
    const original = originals[index], copy = copies[index];
    const box = original.getBoundingClientRect();
    if (box.bottom < 0 || box.top > height || box.right < 0 || box.left > width) { copy.removeAttribute("src"); continue; }
    for (const pseudo of [null, "::before", "::after"]) {
      const paint = getComputedStyle(original, pseudo);
      if (!pseudo) families.add(paint.fontFamily);
      collectURLs(paint.backgroundImage); collectURLs(paint.maskImage); collectURLs(paint.content);
    }
    copy.removeAttribute("srcset"); copy.removeAttribute("sizes"); copy.removeAttribute("loading");
    for (const { name } of Array.from(copy.attributes)) if (name.startsWith("on")) copy.removeAttribute(name);
    if (original instanceof HTMLImageElement) {
      copy.removeAttribute("src");
      const src = original.currentSrc || original.src;
      if (!copy.hasAttribute("width") && original.naturalWidth) copy.setAttribute("width", String(original.naturalWidth));
      if (!copy.hasAttribute("height") && original.naturalHeight) copy.setAttribute("height", String(original.naturalHeight));
      // A freshly cloned image may still be decoding its already cached bytes.
      if (src && !(original.complete && !original.naturalWidth)) { copy.setAttribute("data-raster-src", src); urls.add(src); }
    } else if (original instanceof HTMLCanvasElement) {
      // Protected canvases are deliberately omitted from this decorative copy.
      const image = document.createElement("img"); image.style.cssText = original.style.cssText; image.width = original.width; image.height = original.height;
      copy.replaceWith(image);
      try {
        const blob = await new Promise<Blob | null>(resolve => original.toBlob(resolve));
        if (blob) image.src = await dataURL(blob);
      } catch { /* Cross-origin pixels cannot be exported. */ }
    }
    if (performance.now() - slice > 6) { await yieldTask(); check(); slice = performance.now(); }
  }
  let ruleSlice = performance.now();
  const readRules = async (rules: CSSRuleList, base: string): Promise<string> => {
    const output: string[] = [];
    for (const rule of rules) {
      check();
      if (performance.now() - ruleSlice > 6) { await yieldTask(); check(); ruleSlice = performance.now(); }
      if (rule instanceof CSSStyleRule && !relevant(rule.selectorText)) continue;
      if (rule instanceof CSSKeyframesRule) continue;
      if (rule instanceof CSSFontFaceRule) {
        const key = normalise(`${rule.style.fontFamily}|${rule.style.fontWeight || "normal"}|${rule.style.fontStyle || "normal"}|${rule.style.getPropertyValue("unicode-range") || "U+0-10FFFF"}`);
        if (loadedFaces.has(key) && Array.from(families).some(family => normalise(family).includes(normalise(rule.style.fontFamily)))) {
          const first = rule.style.getPropertyValue("src").split(/,(?=\s*(?:url|local)\()/)[0];
          const face = rule.cssText.replace(/src:[^;]+;/, `src:${first};`).replace(URL_PATTERN, (match, url: string) => /^(#|data:)/.test(url) ? match : `url("${new URL(url, base).href}")`);
          collectURLs(first, base, false); fonts.push(face);
        }
        continue;
      }
      if (rule instanceof CSSGroupingRule) {
        const prefix = rule instanceof CSSMediaRule ? `@media ${rule.conditionText}{` : rule instanceof CSSSupportsRule ? `@supports ${rule.conditionText}{` : rule.cssText.slice(0, rule.cssText.indexOf("{") + 1);
        output.push(prefix + await readRules(rule.cssRules, base) + "}");
        continue;
      }
      // CSS assets use absolute URL keys; unused images are stripped below.
      output.push(rule.cssText.replace(URL_PATTERN, (match, url: string) => /^(#|data:)/.test(url) ? match : `url("${new URL(url, base).href}")`));
    }
    return output.join("\n");
  };
  for (const sheet of document.styleSheets) {
    try { sheets.push(await readRules(sheet.cssRules, sheet.href || document.baseURI)); } catch { check(); /* Opaque cross-origin stylesheet. */ }
  }
  source.dataset.rasterStylesMs = String(Math.round(performance.now() - started));
  check();
  let embeddedChars = 0;
  if (urls.size > 32) throw new Error("snapshot resource budget exceeded");
  const embedded = new Map(await Promise.all(Array.from(urls, async url => {
    const value = await asset(url, signal); embeddedChars += value.length;
    if (embeddedChars > 6_000_000) throw new Error("snapshot resource budget exceeded");
    return [new URL(url, document.baseURI).href, value] as const;
  })));
  check();
  source.dataset.rasterResourcesMs = String(Math.round(performance.now() - started));
  const variables: string[] = [], keys = new Map<string, string>();
  for (const url of cssURLs) { const key = `--raster-asset-${keys.size}`; keys.set(url, key); variables.push(`${key}:url("${embedded.get(url)}")`); }
  const inlineCSS = (value: string) => value.replace(URL_PATTERN, (match, url: string) => {
    if (/^(#|data:)/.test(url)) return match;
    const key = keys.get(new URL(url, document.baseURI).href);
    return key ? `var(${key})` : "none";
  });
  for (const copy of [clone, ...clone.querySelectorAll("*")]) {
    if (copy.hasAttribute("style")) copy.setAttribute("style", inlineCSS(copy.getAttribute("style")!));
    const src = copy.getAttribute("data-raster-src");
    if (src) { copy.setAttribute("src", embedded.get(new URL(src, document.baseURI).href)!); copy.removeAttribute("data-raster-src"); }
  }
  // Preserve the source's real CSS ancestry, including its retained atlas scope
  // when the live destination switches to home. Siblings are never copied.
  let content: Element = clone;
  for (let parent = source.parentElement; parent; parent = parent.parentElement) {
    const ancestor = parent.cloneNode(false) as Element; ancestor.append(content); content = ancestor;
  }
  content.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const fontCSS = fonts.join("\n").replace(URL_PATTERN, (match, url: string) => /^(#|data:)/.test(url) ? match : `url("${embedded.get(url) || "data:,"}")`);
  const css = `:root{${variables.join(";")}}${inlineCSS(sheets.join("\n"))}${fontCSS}*,*::before,*::after{animation:none!important;transition:none!important;view-transition-name:none!important}`;
  const style = document.createElement("style"); style.textContent = css; content.prepend(style);
  source.dataset.rasterCssBytes = String(css.length);
  // Keep CSS viewport units at their original size; the destination raster is
  // capped independently, so high-DPI/4K screens don't multiply shard textures.
  const markup = new XMLSerializer().serializeToString(content);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${markup}</foreignObject></svg>`;
  const bitmap = await renderPageRaster(svg, Math.ceil(width * scale), Math.ceil(height * scale), signal);
  if (signal.aborted || !source.isConnected) { bitmap.close(); check(); }
  source.dataset.rasterReadyMs = String(Math.round(performance.now() - started));
  return bitmap;
}
