// Every page ends with the one shared site footer (packages/atlas-ui/src/AtlasFooter.tsx).
// Walks the route samples of scripts/footer-routes.mjs in English and Russian on a
// running production build and fails when a page has no shared footer, more than
// one, an old footer variant, links into the other language, horizontal overflow,
// a footer in the first screen or something covering it.
//   BASE=http://127.0.0.1:3138 node scripts/qa-footer-coverage.mjs [--widths 1440,390] [--out report.json] [--only /wow/map,/login]
import fs from "node:fs";
import { chromium } from "playwright";
import { footerRoutes } from "./footer-routes.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]?.startsWith("--") ? "1" : all[index + 1] ?? "1"]);
  return pairs;
}, []));
const base = (process.env.BASE ?? args.base ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const widths = (args.widths ?? "1440").split(",").map(Number);
// The audit of an older build can name the footer another way.
const selector = args.selector ?? "footer[data-site-footer]";
const only = args.only ? new Set(args.only.split(",")) : null;

/** Full-screen tools: the footer must not take any of their first screen. */
const TOOLS = new Set(["/wow/map", "/wow/map/[map]", "/wow/transmog", "/talents/[spec]", "/wow/rotation/[spec]", "/wow/mythic-plus/[season]/[dungeon]", "/wow/raids/composition", "/wow/auction"]);

const samples = footerRoutes.filter(route => !route.api && !route.redirect && (!only || only.has(route.path)))
  .flatMap(route => ["en", "ru"].filter(lang => !route.only || route.only === lang).map(lang => ({
    ...route, lang, url: lang === "ru" ? (route.path === "/" ? "/ru" : `/ru${route.path}`) : route.path,
  })));

/** Measured in the page: everything the footer contract promises. */
async function measure(selector) {
  // Kept-alive routes (hidden Activity trees) are not on the page; only rendered footers count.
  const site = [...document.querySelectorAll(selector)].filter(footer => footer.checkVisibility());
  const footers = [...document.querySelectorAll("footer")].filter(footer => footer.checkVisibility());
  // A <footer> is the page's contentinfo landmark unless it sits inside a sectioning element.
  const landmarks = footers.filter(footer => footer.getAttribute("role") === "contentinfo" || !footer.parentElement?.closest("article, aside, main, nav, section, [role=main], [role=article], [role=region]"));
  // Card and dialog footers are fine; a second legal line or a service-page footer is not.
  const legacy = footers.filter(footer => !footer.matches(selector) && /registered trademark|товарный знак|API Console|Gildra Foundation/.test(footer.textContent ?? ""));
  const footer = site[0];
  // Footer navigation names may not repeat a name used elsewhere on the page (the header owns its own).
  const inFooter = new Set([...(footer?.querySelectorAll("nav[aria-label]") ?? [])]);
  const navs = [...document.querySelectorAll("nav[aria-label]")].map(nav => ({ label: nav.getAttribute("aria-label"), footer: inFooter.has(nav) }));
  const lang = document.documentElement.lang;
  const out = {
    status: 0, lang, site: site.length, landmarks: landmarks.length, footers: footers.length, legacy: legacy.length,
    duplicateNavLabels: [...new Set(navs.filter(nav => nav.footer && navs.filter(other => other.label === nav.label).length > 1).map(nav => nav.label))],
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
  if (!footer) return out;
  const rect = footer.getBoundingClientRect();
  out.footerTop = Math.round(rect.top + scrollY);
  out.footerHeight = Math.round(rect.height);
  out.pageHeight = document.documentElement.scrollHeight;
  out.groups = [...footer.querySelectorAll("[data-footer-group]")].map(group => group.getAttribute("data-footer-group"));
  out.links = [...footer.querySelectorAll("a[href]")].map(link => link.getAttribute("href"));
  out.languages = [...footer.querySelectorAll("a[hreflang]")].map(link => `${link.getAttribute("hreflang")}=${link.getAttribute("href")}`);
  out.motion = Boolean(footer.querySelector("[role=switch], input[type=checkbox], button[aria-pressed]"));
  out.legal = /Blizzard/.test(footer.textContent ?? "");
  out.description = footer.querySelector("p")?.textContent?.trim() ?? "";
  // The block right above the footer: its bottom edge and the gap to the footer.
  let previous = footer.previousElementSibling;
  while (previous && previous.getBoundingClientRect().height === 0) previous = previous.previousElementSibling;
  let parent = footer.parentElement;
  while (!previous && parent && parent !== document.body) {
    previous = parent.previousElementSibling;
    while (previous && previous.getBoundingClientRect().height === 0) previous = previous.previousElementSibling;
    parent = parent.parentElement;
  }
  out.gap = previous ? Math.round(rect.top - previous.getBoundingClientRect().bottom) : null;
  // Something else painted over the footer (a sticky bar, a fixed tool panel).
  footer.scrollIntoView({ block: "end" });
  // Tool panels that step aside for the footer do so on an observer and a transition.
  await new Promise(resolve => setTimeout(resolve, 900));
  const visible = footer.getBoundingClientRect();
  const covered = new Set();
  for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) {
    const x = visible.left + visible.width * fx, y = visible.top + visible.height * fy;
    if (y < 0 || y > innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && !footer.contains(hit) && !hit.contains(footer)) covered.add(hit.closest("[class]")?.className?.toString().split(" ")[0] ?? hit.tagName);
  }
  // The cookie notice is dismissed in this browser; the toolbar may overlap only the very top edge.
  out.covered = [...covered];
  return out;
}

const problems = [];
const report = [];
const browser = await chromium.launch();
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: "reduce", isMobile: width < 600, hasTouch: width < 600 });
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch { /* storage off */ } });
  const page = await context.newPage();
  for (const sample of samples) {
    const at = `${sample.url} @${width}`;
    let row = { template: sample.template, url: sample.url, lang: sample.lang, width };
    try {
      const response = await page.goto(base + sample.url, { waitUntil: "load", timeout: 90_000 });
      // Client redirects (a record's localized slug) settle before the page is read.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForFunction(() => !document.querySelector("[data-book-route-loading]"), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      // First screen: where the footer is before anyone scrolls.
      const firstPaint = await page.evaluate(selector => {
        const footer = document.querySelector(selector);
        return footer ? Math.round(footer.getBoundingClientRect().top) : null;
      }, selector);
      // Every address of the redirect chain is the same page.
      const chain = [];
      for (let request = response?.request(); request; request = request.redirectedFrom()) chain.push(decodeURIComponent(new URL(request.url()).pathname));
      row = { ...row, chain, final: decodeURIComponent(new URL(page.url()).pathname), ...(await page.evaluate(measure, selector)), status: response?.status() ?? 0, firstPaint, viewport: page.viewportSize().height };
      // Phone: the groups are a closed accordion that opens on a tap.
      if (width < 600 && row.site === 1) row.accordion = await page.evaluate(selector => {
        const group = document.querySelector(`${selector} details`);
        if (!group) return "no groups";
        const closed = !group.open;
        group.querySelector("summary").click();
        const opened = group.open;
        group.querySelector("summary").click();
        return closed && opened ? "ok" : `closed ${closed}, opens ${opened}`;
      }, selector);
    } catch (error) {
      row.error = String(error).slice(0, 200);
    }
    report.push(row);
    const expected = sample.status ?? 200;
    if (row.error) { problems.push(`${at}: ${row.error}`); continue; }
    if (row.status !== expected) problems.push(`${at}: HTTP ${row.status}, expected ${expected}`);
    if (row.site !== 1) problems.push(`${at}: ${row.site} shared footers`);
    if (row.legacy) problems.push(`${at}: ${row.legacy} old footer variants`);
    if (row.landmarks > 1) problems.push(`${at}: ${row.landmarks} footer landmarks`);
    if (row.duplicateNavLabels.length) problems.push(`${at}: repeated nav labels ${row.duplicateNavLabels.join(", ")}`);
    if (row.overflow > 0) problems.push(`${at}: horizontal overflow ${row.overflow}px`);
    if (row.site === 1) {
      const lang = row.final.startsWith("/ru") ? "ru" : "en";
      if (row.lang !== lang) problems.push(`${at}: document language ${row.lang} on a ${lang} URL`);
      if (row.groups.length !== 7) problems.push(`${at}: ${row.groups.length} footer groups`);
      const foreign = row.links.filter(href => href.startsWith("/") && !row.languages.some(entry => entry.endsWith(`=${href}`)) && (lang === "ru" ? !/^\/ru(\/|$)/.test(href) : /^\/ru(\/|$)/.test(href)));
      if (foreign.length) problems.push(`${at}: links into the other language ${foreign.slice(0, 3).join(", ")}`);
      if (!row.motion || !row.legal || row.languages.length !== 2) problems.push(`${at}: footer controls incomplete`);
      const hub = { en: "/wow", ru: "/ru/wow" };
      const languages = row.languages.map(entry => decodeURIComponent(entry));
      // The page as addressed, redirected or settled (tools rewrite their query into the address).
      const pairs = [row.final, ...row.chain].map(path => {
        const bare = path.replace(/^\/ru(?=\/|$)/, "") || "/";
        const twin = (to) => sample.only || expected === 404 ? hub[to] : to === "ru" ? (bare === "/" ? "/ru" : `/ru${bare}`) : bare;
        return [`en=${lang === "en" && expected !== 404 ? path : twin("en")}`, `ru=${lang === "ru" && expected !== 404 ? path : twin("ru")}`];
      });
      const wanted = pairs[0];
      if (!pairs.some(pair => pair.every(entry => languages.includes(entry)))) problems.push(`${at}: language links ${languages.join(" ")}, expected ${wanted.join(" ")}`);
      if (row.accordion && row.accordion !== "ok") problems.push(`${at}: phone accordion ${row.accordion}`);
      // A tool keeps the whole first screen; the footer follows it.
      if (TOOLS.has(sample.template) && row.firstPaint !== null && row.firstPaint < row.viewport) problems.push(`${at}: footer in the first screen (${row.firstPaint}px)`);
      if (row.covered.length) problems.push(`${at}: footer covered by ${row.covered.join(", ")}`);
    }
  }
  await context.close();
}
await browser.close();
if (args.out) fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
console.log(`${report.length} pages checked, ${problems.length} problems`);
for (const problem of problems) console.log(`- ${problem}`);
process.exit(problems.length ? 1 : 0);
