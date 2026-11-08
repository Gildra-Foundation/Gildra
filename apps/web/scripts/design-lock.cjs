#!/usr/bin/env node
// Фиксация дизайна эталонных страниц (/wow/mythic-plus, /wow/mythic-plus/meta, /wow/raids):
// полностраничные скриншоты и замер вычисленных стилей.
// Источник правды: docs/design/reference/README.md. Из корня репозитория:
//   npm run design:lock                                   # прод против docs/design/reference/design-lock.json
//   npm run design:lock -- --base http://127.0.0.1:3100   # кандидат
//   npm run design:lock -- --capture --out <dir> [--shots] # переснять эталон (только по решению владельца)
// Режим проверки: замеряет страницы заново и сравнивает стиль с эталоном (тексты, данные и
// координаты не сравниваются). Код выхода 1 при расхождении.
const path = require("node:path");
const fs = require("node:fs");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
  return a;
}, []));
const { chromium } = require("playwright-core");
if (!args.capture && !args.check) args.check = path.join(__dirname, "../../../docs/design/reference/design-lock.json");
const base = (args.base ?? "https://gildra.net").replace(/\/$/, "");
const out = args.out ?? ".";
const pages = [
  { slug: "mythic-hub", route: "/wow/mythic-plus" },
  { slug: "meta", route: "/wow/mythic-plus/meta" },
  { slug: "raid-hub", route: "/wow/raids" },
];
const viewports = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const runs = [["desktop", "en"], ["phone", "ru"], ["desktop", "ru"], ["phone", "en"]];

// Выполняется в странице: токены :root и вычисленные стили ключевых элементов.
function measure() {
  const pick = (el, props) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = { box: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] };
    for (const p of props) o[p] = cs.getPropertyValue(p).trim();
    return o;
  };
  const TEXT = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "color", "text-shadow"];
  const BOX = ["background-color", "border-image-source", "border-image-slice", "border-radius", "padding", "gap", "max-width"];
    const h1 = document.querySelector("main h1, h1");
  // Токены оболочки заданы на кадре атласа, а не на :root — читаем их с H1.
  const root = getComputedStyle(h1 ?? document.documentElement);
  const tokens = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (!rule.style) continue;
      for (const name of rule.style) if (name.startsWith("--atlas-") && !(name in tokens)) tokens[name] = root.getPropertyValue(name).trim();
    }
  }
  const hero = h1?.closest("header, section, div");
  const label = [...(hero?.querySelectorAll("p, span, div") ?? [])]
    .find((e) => e.children.length === 0 && getComputedStyle(e).textTransform === "uppercase" && e.textContent.trim().length > 2);
  const buttons = [...document.querySelectorAll("main a, main button")]
    .filter((e) => getComputedStyle(e).borderImageSource !== "none" || e.closest("[data-mythic-asset-button],[data-raid-asset-button]"));
  const h2s = [...document.querySelectorAll("main h2")];
  const h3s = [...document.querySelectorAll("main h3")];
  const lead = [...(hero?.querySelectorAll("p") ?? [])].find((e) => parseFloat(getComputedStyle(e).fontSize) >= 14 && e.textContent.trim().length > 20);
  const main = document.querySelector("main");
  const header = document.querySelector("body > header, header[role=banner], header");
  const footer = [...document.querySelectorAll("footer")].pop();
  return {
    title: document.title,
    theme: document.documentElement.dataset.siteTheme ?? "default",
    scrollWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    tokens,
    elements: {
      h1: { text: h1?.textContent.trim(), ...pick(h1, [...TEXT, "max-width", "background-image", "-webkit-background-clip"]) },
      eyebrow: label ? { text: label.textContent.trim(), ...pick(label, TEXT) } : null,
      lead: lead ? pick(lead, [...TEXT, "max-width"]) : null,
      h2: h2s.map((e) => ({ text: e.textContent.trim(), ...pick(e, TEXT) })),
      h3: { count: h3s.length, first: h3s[0] ? { text: h3s[0].textContent.trim(), ...pick(h3s[0], TEXT) } : null },
      buttons: buttons.slice(0, 6).map((e) => ({ text: e.textContent.trim(), ...pick(e, [...TEXT, ...BOX, "height", "min-height"]) })),
      main: pick(main, ["max-width", "padding"]),
      header: pick(header, ["position", "background-color", "backdrop-filter", "height"]),
      footer: pick(footer, ["background-color", "color", "font-size"]),
      body: pick(document.body, ["background-color", "color", "font-family", "font-size"]),
    },
    images: [...document.querySelectorAll("main img")].length,
    paintedAssets: [...new Set([...document.querySelectorAll("main *")].flatMap((e) => {
      const css = [null, "::before", "::after"].map((pe) => { const cs = getComputedStyle(e, pe); return `${cs.borderImageSource} ${cs.backgroundImage} ${cs.maskImage}`; }).join(" ");
      // An <img> counts with its declared file and with the srcset copy the screen chose (a 192 px copy of a 384 px cutout is the same asset).
      const srcs = e.tagName === "IMG" ? [...new Set([e.currentSrc, e.src].filter(Boolean))] : [];
      return [...(css.match(/\/[^"'()]+?\.(webp|png|avif|jpg)/g) ?? []), ...srcs.map((src) => new URL(src).pathname)];
    }).map((u) => u.replace(/^.*?(\/(?:_next|assets|images|wow|atlas)\/)/, "$1")))].sort(),
  };
}

// Сравнение стиля: токены, типографика ключевых элементов, кнопки, шапка, нарисованные ассеты.
function compare(ref, cur) {
  const STYLE = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "color",
    "text-shadow", "max-width", "background-image", "-webkit-background-clip", "background-color", "border-image-source",
    "border-image-slice", "border-radius", "padding", "gap", "height", "min-height", "position", "backdrop-filter"];
  const problems = [];
  const diff = (where, a, b) => {
    if (!a || !b) { if (!a !== !b) problems.push(`${where}: элемент ${a ? "пропал" : "появился"}`); return; }
    for (const k of STYLE) if (k in a && a[k] !== b[k]) problems.push(`${where} ${k}: ${a[k]} → ${b[k]}`);
  };
  for (const [slug, page] of Object.entries(ref.pages)) for (const [run, a] of Object.entries(page.runs)) {
    const b = cur.pages[slug]?.runs[run];
    const at = `${slug} ${run}`;
    if (!b) { problems.push(`${at}: нет замера`); continue; }
    if (b.status !== 200) problems.push(`${at}: HTTP ${b.status}`);
    if (b.consoleErrors.length) problems.push(`${at}: ошибки консоли ${b.consoleErrors.length}`);
    if (b.scrollWidth > (run.startsWith("phone") ? 390 : 1440)) problems.push(`${at}: горизонтальный скролл ${b.scrollWidth}`);
    for (const [k, v] of Object.entries(a.tokens)) if (b.tokens[k] !== v) problems.push(`${at} ${k}: ${v} → ${b.tokens[k] ?? "нет"}`);
    const ea = a.elements, eb = b.elements;
    for (const k of ["h1", "eyebrow", "lead", "header", "body"]) diff(`${at} ${k}`, ea[k], eb[k]);
    diff(`${at} h2`, ea.h2[0], eb.h2[0]);
    diff(`${at} h3`, ea.h3.first, eb.h3.first);
    diff(`${at} кнопка`, ea.buttons[0], eb.buttons[0]);
    const missing = a.paintedAssets.filter((u) => !u.startsWith("/_next/") && !b.paintedAssets.includes(u));
    if (missing.length) problems.push(`${at}: пропали ассеты ${missing.join(", ")}`);
  }
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? `РАСХОЖДЕНИЯ С ЭТАЛОНОМ (${uniq.length}):\n- ${uniq.join("\n- ")}` : "OK: стиль совпадает с эталоном");
  return uniq.length ? 1 : 0;
}

(async () => {
  const browser = await chromium.launch();
  const lock = { capturedAt: new Date().toISOString(), base, pages: {} };
  if (args.shots) fs.mkdirSync(path.join(out, "shots"), { recursive: true });
  for (const p of pages) {
    lock.pages[p.slug] = { route: p.route, runs: {} };
    for (const [vp, lang] of runs) {
      const ctx = await browser.newContext({ viewport: viewports[vp], reducedMotion: "reduce", deviceScaleFactor: 1,
        hasTouch: vp === "phone", isMobile: vp === "phone" });
      await ctx.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const url = `${base}${lang === "ru" ? "/ru" : ""}${p.route}`;
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: Number(args.timeout ?? 90000) });
      await page.evaluate(async () => { await document.fonts.ready; });
      // Прокрутка до низа, чтобы ленивые картинки и reveal-секции дорисовались.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(800);
      // Плашку cookie прячем, если согласие не подхватилось.
      await page.addStyleTag({ content: "[data-cookie-notice],[class*=cookieNotice]{display:none!important}" });
      const m = await page.evaluate(measure);
      m.status = res?.status(); m.consoleErrors = errors;
      lock.pages[p.slug].runs[`${vp}-${lang}`] = m;
      if (args.shots) await page.screenshot({ path: path.join(out, "shots", `${p.slug}-${vp === "desktop" ? 1440 : 390}-${lang}.png`), fullPage: true });
      console.log(p.slug, vp, lang, res?.status(), `h=${m.pageHeight}`, `sw=${m.scrollWidth}`, `err=${errors.length}`);
      await ctx.close();
    }
  }
  await browser.close();
  if (args.check) process.exit(compare(JSON.parse(fs.readFileSync(args.check, "utf8")), lock));
  fs.writeFileSync(path.join(out, "design-lock.json"), JSON.stringify(lock, null, 2));
})();
