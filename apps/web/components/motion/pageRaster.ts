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
function asset(url: string, signal: AbortSignal) {
  if (url.startsWith("data:")) return Promise.resolve(url);
  const parsed = new URL(url, document.baseURI), absolute = parsed.href;
  const reusable = staticAsset(parsed);
  const cached = reusable ? assets.get(absolute) : undefined;
  if (cached) return cached.promise;
  const promise = fetch(absolute, { cache: "force-cache", signal }).then(response => {
      if (!response.ok) throw new Error("snapshot asset unavailable");
      return response.blob();
    }).then(async blob => {
      if (blob.size > 2_000_000) throw new Error("snapshot asset too large");
      return dataURL(blob);
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

function staticAsset(url: URL) {
  return url.origin === location.origin && (/^\/(assets\/|_next\/static\/|platform\/icons\/)/.test(url.pathname) ||
    url.pathname === "/_next/image" && (url.searchParams.get("url") || "").startsWith("/assets/"));
}
type PreparedRule =
  | { kind: "style"; text: string; selectors: (string[] | null)[] | null }
  | { kind: "group"; prefix: string; children: PreparedRule[] }
  | { kind: "font"; key: string; family: string; src: string; text: string };
// CSSOM strings/selector classes are immutable for each production stylesheet.
// Prepare them after loading instead of reading thousands of DOM properties on
// every click. The WeakMap releases sheets removed by the router.
const styleCache = new WeakMap<CSSStyleSheet, Promise<PreparedRule[]>>();
const stylesheetURLs = new Map<string, Promise<PreparedRule[]>>();
const loadedStaticURLs = new Set<string>();
let resourceObserver: PerformanceObserver | undefined;
function rememberResource(name: string) {
  const url = new URL(name, document.baseURI);
  if (!staticAsset(url)) return;
  loadedStaticURLs.add(url.href);
  if (loadedStaticURLs.size > 256) loadedStaticURLs.delete(loadedStaticURLs.values().next().value!);
}
function preparedSheet(sheet: CSSStyleSheet) {
  let cached = styleCache.get(sheet) || (sheet.href ? stylesheetURLs.get(sheet.href) : undefined);
  if (cached) { styleCache.set(sheet, cached); return cached; }
  cached = (async () => {
    await yieldTask();
    let slice = performance.now();
    const base = sheet.href || document.baseURI;
    const absoluteURLs = (text: string) => text.replace(URL_PATTERN, (match, url: string) => /^(#|data:)/.test(url) ? match : `url("${new URL(url, base).href}")`);
    const read = async (rules: CSSRuleList): Promise<PreparedRule[]> => {
      const output: PreparedRule[] = [];
      for (const rule of rules) {
        if (performance.now() - slice > 6) { await yieldTask(); slice = performance.now(); }
        if (rule instanceof CSSKeyframesRule) continue;
        if (rule instanceof CSSFontFaceRule) {
          const src = absoluteURLs(rule.style.getPropertyValue("src").split(/,(?=\s*(?:url|local)\()/)[0]);
          output.push({ kind: "font", family: normalise(rule.style.fontFamily),
            key: normalise(`${rule.style.fontFamily}|${rule.style.fontWeight || "normal"}|${rule.style.fontStyle || "normal"}|${rule.style.getPropertyValue("unicode-range") || "U+0-10FFFF"}`),
            src, text: absoluteURLs(rule.cssText.replace(/src:[^;]+;/, `src:${src};`)) });
        } else if (rule instanceof CSSGroupingRule) {
          const prefix = rule instanceof CSSMediaRule ? `@media ${rule.conditionText}{` : rule instanceof CSSSupportsRule ? `@supports ${rule.conditionText}{` : rule.cssText.slice(0, rule.cssText.indexOf("{") + 1);
          output.push({ kind: "group", prefix, children: await read(rule.cssRules) });
        } else {
          const selectors = rule instanceof CSSStyleRule ? rule.selectorText.split(",").map(branch =>
            /:(is|where|not|has)\(/.test(branch) ? null : Array.from(branch.matchAll(/\.([_a-zA-Z][_a-zA-Z0-9-]*)/g), match => match[1])) : null;
          output.push({ kind: "style", selectors, text: absoluteURLs(rule.cssText) });
        }
      }
      return output;
    };
    try { return await read(sheet.cssRules); } catch { return []; /* Opaque stylesheet. */ }
  })();
  styleCache.set(sheet, cached);
  if (sheet.href) {
    stylesheetURLs.set(sheet.href, cached);
    if (stylesheetURLs.size > 24) stylesheetURLs.delete(stylesheetURLs.keys().next().value!);
  }
  return cached;
}
/** Warm only immutable public styles/assets; never page or form data. */
export function warmPageCapture() {
  // Let the lightweight host handshake finish before CPU/network warming can
  // compete with its parallelism probe or its bootstrap script request.
  void rasterHostReady().then(() => {
    if (document.hidden) return;
    if (!resourceObserver) {
      resourceObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) rememberResource(entry.name); });
      resourceObserver.observe({ type: "resource", buffered: true });
    }
    const controller = new AbortController();
    void Promise.all(Array.from(document.styleSheets, preparedSheet));
    const loaded = performance.getEntriesByType("resource").map(entry => new URL(entry.name, document.baseURI))
      .filter(url => staticAsset(url) && (/\.(avif|webp|png|jpe?g|svg|woff2)$/i.test(url.pathname) || url.pathname === "/_next/image"));
    for (const url of loaded.slice(-24)) void asset(url.href, controller.signal).catch(() => {});
  }).catch(() => {});
}

/** One bounded, transient raster shared by all shards. Reuse the loaded CSS,
 * rather than reading hundreds of computed properties for every element. The
 * viewport copy is already inert and excludes offscreen list descendants.
 */
export async function pageRaster(source: HTMLElement, signal: AbortSignal): Promise<ImageBitmap> {
  const started = performance.now();
  const check = () => { if (signal.aborted || !source.isConnected) throw new DOMException("Cancelled", "AbortError"); };
  check();
  // Freeze source CSS/ancestry before the router swaps its links and scope.
  // Reading destination styles later both wasted time and missed the warm cache.
  const sourceSheets = Array.from(document.styleSheets), ancestors: Element[] = [];
  const loadedURLs = new Set([...loadedStaticURLs, ...performance.getEntriesByType("resource").map(entry => entry.name)]);
  for (let parent = source.parentElement; parent; parent = parent.parentElement) ancestors.push(parent.cloneNode(false) as Element);
  const loadedFaces = new Set(Array.from(document.fonts).filter(face => face.status === "loaded").map(face => normalise(`${face.family}|${face.weight}|${face.style}|${face.unicodeRange}`)));
  let cachedSheets = 0;
  for (const sheet of sourceSheets) void (styleCache.get(sheet) || (sheet.href ? stylesheetURLs.get(sheet.href) : undefined))?.then(() => { cachedSheets++; });
  await rasterHostReady();
  source.dataset.rasterHostMs = String(Math.round(performance.now() - started));
  source.dataset.rasterCachedSheets = `${cachedSheets}/${sourceSheets.length}`;
  await yieldTask();
  check();
  const width = innerWidth, height = innerHeight, scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const urls = new Set<string>(), cssURLs = new Set<string>(), fonts: string[] = [], sheets: string[] = [];
  const classes = new Set<string>();
  for (const element of [source, ...source.querySelectorAll("*")]) for (const name of element.classList) classes.add(name);
  for (let ancestor = source.parentElement; ancestor; ancestor = ancestor.parentElement) for (const name of ancestor.classList) classes.add(name);
  const collectURLs = (value: string, base = document.baseURI, cssAsset = true) => {
    for (const match of value.matchAll(URL_PATTERN)) if (!/^(#|data:)/.test(match[1])) {
      const url = new URL(match[1], base);
      if (url.hash && url.href.split("#")[0] === location.href.split("#")[0]) continue;
      urls.add(url.href);
      if (cssAsset) cssURLs.add(url.href);
    }
  };
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll("*")], copies = [clone, ...clone.querySelectorAll("*")];
  let slice = performance.now();
  for (let index = 0; index < originals.length; index++) {
    check();
    const original = originals[index], copy = copies[index];
    const box = original.getBoundingClientRect();
    if ((!box.width && !box.height) || box.bottom < 0 || box.top > height || box.right < 0 || box.left > width) { copy.removeAttribute("src"); copy.removeAttribute("srcset"); continue; }
    // The isolated image renderer resolves the actual CSS. Here we only need
    // the already loaded assets it may reference, not computed styles for every
    // element/pseudo-element (which forced repeated UI style/layout work).
    collectURLs(copy.getAttribute("style") || "");
    copy.removeAttribute("srcset"); copy.removeAttribute("sizes"); copy.removeAttribute("loading");
    for (const { name } of Array.from(copy.attributes)) if (name.startsWith("on")) copy.removeAttribute(name);
    if (original instanceof HTMLImageElement) {
      copy.removeAttribute("src");
      const src = original.currentSrc || original.src;
      if (!copy.hasAttribute("width") && original.naturalWidth) copy.setAttribute("width", String(original.naturalWidth));
      if (!copy.hasAttribute("height") && original.naturalHeight) copy.setAttribute("height", String(original.naturalHeight));
      // A freshly cloned image may still be decoding its already cached bytes.
      if (src && (original.hasAttribute("data-transition-image-ready") || original.complete && original.naturalWidth)) { copy.setAttribute("data-raster-src", src); urls.add(src); }
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
  // CSS is collected through CSSOM below. Document metadata is never page
  // content; in particular noscript changes meaning in an SVG image document.
  clone.querySelectorAll("script,noscript,style,link,meta,base,template").forEach(node => node.remove());
  source.dataset.rasterDomMs = String(Math.round(performance.now() - started));
  const selectRules = async (rules: PreparedRule[]): Promise<string> => {
    const output: string[] = [];
    for (const rule of rules) {
      check();
      if (performance.now() - slice > 6) { await yieldTask(); check(); slice = performance.now(); }
      if (rule.kind === "font") {
        if (loadedFaces.has(rule.key)) {
          collectURLs(rule.src, document.baseURI, false); fonts.push(rule.text);
        }
      } else if (rule.kind === "group") output.push(rule.prefix + await selectRules(rule.children) + "}");
      else if (!rule.selectors || rule.selectors.some(branch => !branch || branch.every(name => classes.has(name)))) output.push(rule.text);
    }
    return output.join("\n");
  };
  for (const sheet of sourceSheets) sheets.push(await selectRules(await preparedSheet(sheet)));
  for (const ancestor of ancestors) collectURLs(ancestor.getAttribute("style") || "");
  for (const match of sheets.join("\n").matchAll(URL_PATTERN)) {
    if (/^(#|data:)/.test(match[1])) continue;
    const url = new URL(match[1], document.baseURI).href;
    if (loadedURLs.has(url) || assets.has(url) || url.startsWith("blob:")) collectURLs(match[0]);
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
  for (const ancestor of ancestors) { ancestor.append(content); content = ancestor; }
  content.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const fontCSS = fonts.join("\n").replace(URL_PATTERN, (match, url: string) => /^(#|data:)/.test(url) ? match : `url("${embedded.get(url) || "data:,"}")`);
  const css = `:root{${variables.join(";")}}${inlineCSS(sheets.join("\n"))}${fontCSS}*,*::before,*::after{animation:none!important;transition:none!important;view-transition-name:none!important}`;
  const style = document.createElement("style"); style.textContent = css;
  style.setAttribute("style", "display:none!important"); content.prepend(style);
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
