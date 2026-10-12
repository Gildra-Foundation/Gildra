#!/usr/bin/env node
// Guards the atlas theme: stylesheets that opted in must take colours, fonts
// and type sizes from the tokens in app/styles/atlas-theme.css.
//
// Checked files: every CSS module (*.module.css) in components/ and app/, plus
// any stylesheet whose first line contains `atlas:strict`, except the surfaces
// listed in `exempt` with their reason. New modules are strict by default.
// Run: npm run atlas:check
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const scanDirs = ["components", "app"];
const exempt = {
  "components/platform/home/": "landing scene — its own materials (0 px gate)",
  "components/wow/audit/": "contents book — its own materials",
  "components/platform/navigation/bookNavigation.module.css": "contents book dialog — its own materials",
  "components/platform/rotation/": "rotation lab — per-spec themed workbench (to tokens in roadmap wave 3)",
  "components/platform/profile/": "fixture page — hidden for the WoW MVP",
  "components/platform/patches/": "fixture page — hidden for the WoW MVP",
  "components/league/": "League of Legends — hidden for the WoW MVP",
  "components/platform/games/": "Genshin and Diablo hubs — hidden for the WoW MVP",
  "components/platform/compare/": "fixture page — hidden for the WoW MVP",
  "components/analytics/": "analytics product skin",
  "components/cms/reader.module.css": "reader account pages skin",
  "components/motion/routeTransition.module.css": "global route chrome, rendered outside the atlas scope",
  "components/blueprints/": "legacy blueprint skin — to be moved onto tokens (roadmap wave 3)",
  "components/platform/shared/platformAtmosphere.module.css": "atmosphere of the hidden fixture pages",
  "components/wow/shared/wowTooltip.module.css": "in-game WoW tooltip look — joins AtlasTooltip with roadmap item 14",
  "components/wow/season2/": "Season 2 status hub skin — to tokens in roadmap wave 3",
  "components/talents/TalentTreePanel.module.css": "talent tree — class colours of the game",
};
const allowedHex = new Set(["#000", "#020303"]);
const retiredAliases = {
  background: "--atlas-bg", title: "--atlas-text-strong", muted: "--atlas-text-muted", "accent-bright": "--atlas-accent-strong",
  border: "--atlas-line", rule: "--atlas-line-soft", display: "--atlas-font-display", ui: "--atlas-font-ui",
};
const retiredAlias = new RegExp(`--atlas-(${Object.keys(retiredAliases).join("|")})(?![\\w-])`, "g");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".css")) yield full;
  }
}

const problems = [];
let checked = 0;
for (const dir of scanDirs) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file);
    const source = fs.readFileSync(file, "utf8");
    // Removed aliases must not come back in any stylesheet.
    source.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(retiredAlias)) problems.push(`${rel}:${index + 1}  ${match[0]} was retired — use ${retiredAliases[match[1]]}`);
    });
    const marked = source.split("\n", 1)[0].includes("atlas:strict");
    const strict = marked || (rel.endsWith(".module.css") && !Object.keys(exempt).some((prefix) => rel.startsWith(prefix)));
    if (!strict) continue;
    checked += 1;
    source.split("\n").forEach((line, index) => {
      const code = line.replace(/\/\*.*?\*\//g, "");
      const where = `${rel}:${index + 1}`;
      for (const match of code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!allowedHex.has(match[0].toLowerCase())) problems.push(`${where}  colour ${match[0]} — use a --atlas-* colour token`);
      }
      const family = code.match(/font-family\s*:\s*([^;]+)/);
      if (family && !family[1].includes("var(--atlas-font")) problems.push(`${where}  font-family "${family[1].trim()}" — use var(--atlas-font-display) or var(--atlas-font-ui)`);
      const shorthand = code.match(/(?:^|[\s;{])font\s*:\s*([^;]+)/);
      if (shorthand && !shorthand[1].includes("var(--atlas-font") && !/^(inherit|initial|unset)$/.test(shorthand[1].trim())) problems.push(`${where}  font shorthand without an atlas font token`);
      for (const match of code.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
        if (Number(match[1]) < 11) problems.push(`${where}  font-size ${match[1]}px is below the 11 px minimum — use --atlas-text-label or larger`);
      }
    });
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\natlas:check — ${problems.length} problem(s) in ${checked} strict stylesheet(s).`);
  process.exit(1);
}
console.log(`atlas:check — ${checked} strict stylesheet(s) use theme tokens only.`);
