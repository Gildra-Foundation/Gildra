#!/usr/bin/env node
// Accessibility audit of the inner pages (roadmap items 51, 52, 54, 60): axe-core
// (WCAG 2.2 A/AA rules) at 1440 and 390; contrast of text set on artwork (measured
// on the pixels behind the words); a visible focus on the first 30 Tab stops; and
// touch targets on the phone — buttons, controls and block links at least 44 px
// tall and 34 px wide (a transparent ::before/::after hit area counts); text links
// follow WCAG 2.5.8 (checked by axe).
//   npm run qa:a11y                          local :3100, default routes
//   npm run qa:a11y -- --base https://gildra.net --routes /ru/wow,/wow/raids
// Exits 1 on any axe violation of impact serious/critical or a small target.
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3100";
const routes = (args.routes ?? [
  "/ru/wow", "/wow/raids", "/ru/wow/raids/the-voidspire", "/ru/wow/raids/the-voidspire/imperator-averzian",
  "/ru/wow/lairs", "/ru/wow/lairs/nymrissa-wavecaller", "/wow/classes", "/ru/wow/mythic-plus",
  "/wow/mythic-plus/midnight-season-2/murder-row", "/ru/wow/delves", "/ru/database", "/tier-lists",
  "/ru/library", "/ru/search", "/ru/privacy", "/ru/wow/nonexistent",
].join(",")).split(",");
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const browser = await chromium.launch();
const failures = [];
const summary = new Map();
for (const [name, viewport] of Object.entries(viewports)) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", ...(name === "mobile" ? { isMobile: true, hasTouch: true } : {}) });
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
  for (const route of routes) {
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 90_000 });
    await page.waitForTimeout(800);
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async () => {
      // axe is injected above
      const report = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
      // Map pins: the step list beside the map is the equivalent control (WCAG 2.5.8 "equivalent").
      for (const violation of report.violations) if (violation.id === "target-size") violation.nodes = violation.nodes.filter((node) => !document.querySelector(node.target.join(" "))?.closest("[data-equivalent-targets]"));
      report.violations = report.violations.filter((violation) => violation.nodes.length);
      return report.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), count: v.nodes.length }));
    });
    const small = name === "mobile" ? await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary")) {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || getComputedStyle(el).visibility === "hidden") continue;
        if (el.closest("[aria-hidden=true], [inert]")) continue;
        // Links inside running text and text-link rows (breadcrumbs, legal line) follow
        // WCAG 2.5.8 (24 px or spacing, checked by axe), not the 44 px control rule.
        const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|SMALL|TD|DD)$/.test(el.parentElement.tagName);
        if (inline || el.closest("[data-text-links]")) continue;
        // Map pins have an equivalent control (the step list beside the map): WCAG 2.5.8 "equivalent".
        if (el.closest("[data-equivalent-targets]")) continue;
        // A transparent ::after/::before with position:absolute may extend the hit area.
        let { left, top, right, bottom } = rect;
        for (const pseudo of ["::before", "::after"]) {
          const style = getComputedStyle(el, pseudo);
          if (style.content === "none" || style.position !== "absolute") continue;
          const px = (value) => (value.endsWith("px") ? parseFloat(value) : 0);
          // The pseudo box is laid out against the nearest positioned box (the element itself or an ancestor).
          const block = getComputedStyle(el).position !== "static" ? el : el.offsetParent;
          if (!block) continue;
          const area = block.getBoundingClientRect();
          left = Math.min(left, area.left + px(style.left)); top = Math.min(top, area.top + px(style.top));
          right = Math.max(right, area.right - px(style.right)); bottom = Math.max(bottom, area.bottom - px(style.bottom));
        }
        const box = { width: right - left, height: bottom - top };
        if (box.width < 34 || box.height < 44) out.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0].slice(0, 40) : ""} ${Math.round(box.width)}×${Math.round(box.height)} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}"`);
      }
      return out;
    }) : [];
    // Text set on artwork (roadmap item 52): axe cannot read a picture, so hide the
    // words (their shadow stays: a halo is part of what is behind them), photograph
    // that and test the text colour against the
    // brightest 5 % of that background (the worst case under any letter).
    const onArt = await page.evaluate(() => [...document.querySelectorAll("[data-atlas-frame] header h1, [data-atlas-frame] header h1 + p, [data-atlas-frame] header nav[data-text-links] a, [data-atlas-frame] header p")]
      .filter((el) => el.getBoundingClientRect().top < innerHeight && el.getBoundingClientRect().width > 0)
      .slice(0, 6)
      .map((el, index) => {
        el.setAttribute("data-a11y-probe", String(index));
        // The boxes of the words themselves, not of the (often full-width) block.
        const range = document.createRange();
        range.selectNodeContents(el);
        const boxes = [...range.getClientRects()].filter((box) => box.width > 2 && box.height > 2).map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height }));
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        const bold = Number(getComputedStyle(el).fontWeight) >= 700;
        return { index, color: getComputedStyle(el).color, text: (el.textContent || "").trim().slice(0, 24), boxes, large: fontSize >= 24 || (bold && fontSize >= 18.66) };
      }));
    if (onArt.length) {
      await page.addStyleTag({ content: "[data-a11y-probe], [data-a11y-probe] * { color: transparent !important; -webkit-text-stroke: 0 !important; }" });
      const shot = PNG.sync.read(await page.screenshot());
      const scale = shot.width / viewport.width;
      const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      for (const probe of onArt) {
        const values = [];
        for (const box of probe.boxes) {
          for (let y = Math.max(0, Math.floor(box.y * scale)); y < Math.min(shot.height, (box.y + box.height) * scale); y += 2) {
            for (let x = Math.max(0, Math.floor(box.x * scale)); x < Math.min(shot.width, (box.x + box.width) * scale); x += 2) {
              const i = (y * shot.width + x) * 4; values.push(lum(shot.data[i], shot.data[i + 1], shot.data[i + 2]));
            }
          }
        }
        if (!values.length) continue;
        values.sort((a, b) => b - a);
        const background = values[Math.floor(values.length * 0.05)];
        const [r, g, b] = probe.color.match(/\d+/g).map(Number);
        const text = lum(r, g, b);
        const ratio = (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
        if (ratio < (probe.large ? 3 : 4.5)) {
          result.push({ id: "text-on-art-contrast", impact: "serious", help: "Text on artwork keeps WCAG AA against the picture behind it", nodes: [`"${probe.text}" ${ratio.toFixed(2)}:1`], count: 1 });
        }
      }
    }
    // Keyboard (roadmap item 60): the first 30 Tab stops all show a visible focus indicator.
    if (name === "desktop") {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      const unseen = [];
      for (let step = 0; step < 30; step += 1) {
        await page.keyboard.press("Tab");
        const state = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          const shows = (node) => { const look = getComputedStyle(node); return (look.outlineStyle !== "none" && parseFloat(look.outlineWidth) > 0) || look.boxShadow !== "none"; };
          // A field may show focus on its wrapper (:focus-within), not on itself.
          const ring = shows(el) || style.textDecorationLine.includes("underline") || [el.parentElement, el.parentElement?.parentElement].some((node) => node?.matches(":focus-within") && shows(node));
          const label = `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}"`;
          return { ring, label };
        });
        if (!state) break;
        if (!state.ring) unseen.push(state.label);
      }
      if (unseen.length) result.push({ id: "focus-visible", impact: "serious", help: "Every Tab stop shows a visible focus indicator", nodes: unseen.slice(0, 6), count: unseen.length });
    }
    for (const violation of result) {
      const key = `${violation.impact} ${violation.id}`;
      const entry = summary.get(key) ?? { help: violation.help, pages: new Set(), nodes: new Set() };
      entry.pages.add(`${name} ${route}`);
      violation.nodes.forEach((node) => entry.nodes.add(node));
      summary.set(key, entry);
      if (violation.impact === "serious" || violation.impact === "critical") failures.push(`${name} ${route}: ${violation.id}`);
    }
    if (small.length) {
      const key = "target-size (phone, 44 px)";
      const entry = summary.get(key) ?? { help: "Touch targets at least 44×44 px", pages: new Set(), nodes: new Set() };
      entry.pages.add(`${name} ${route}`);
      small.forEach((node) => entry.nodes.add(node));
      summary.set(key, entry);
      failures.push(`${name} ${route}: ${small.length} small target(s)`);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();

for (const [key, entry] of [...summary].sort()) {
  console.log(`\n${key} — ${entry.help} (${entry.pages.size} page views)`);
  console.log(`  pages: ${[...entry.pages].slice(0, 6).join(", ")}${entry.pages.size > 6 ? " …" : ""}`);
  console.log(`  nodes: ${[...entry.nodes].slice(0, args.verbose ? 60 : 8).join(" | ")}`);
}
console.log(failures.length ? `\nqa:a11y — ${failures.length} failing page view(s)` : "\nqa:a11y — no serious violations, every touch target ≥ 44 px");
process.exit(failures.length ? 1 : 0);
