#!/usr/bin/env node
// Release gate and design review of a candidate build (roadmap items 97, 100).
// Runs every visual and behavioural check against a running candidate server
// and writes one report to read before deploying:
//   npm run qa:release [-- --candidate http://127.0.0.1:3100 --base https://gildra.net --max 0.5]
//   npm run qa:release -- --candidate https://gildra.net --live      (quarterly audit of the live site)
// Static checks (typecheck, lint, tests, routes:check, atlas:check) run in CI.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "true"]);
  return pairs;
}, []));
const candidate = args.candidate ?? "http://127.0.0.1:3100";
const base = args.base ?? "https://gildra.net";
const live = args.live === "true";
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const outDir = `.artifacts/release-gate/${stamp}`;
fs.mkdirSync(outDir, { recursive: true });

const steps = [
  ...(live ? [] : [["Landing and book unchanged (0 px)", "qa:home-gate", ["--candidate", candidate, "--base", base, "--out", `${outDir}/home-gate`]]]),
  ...(live ? [] : [["Inner pages against live", "visual:diff", ["--candidate", candidate, "--base", base, "--max", args.max ?? "0.5", "--out", `${outDir}/visual`]]]),
  ["Accessibility (axe, art contrast, focus, targets)", "qa:a11y", ["--base", candidate]],
  ["Motion budget and smoothness", "qa:motion", ["--base", candidate]],
  ["Route budgets (JS, CSS, images)", "budgets", ["--base", candidate]],
  ["Route smoke (statuses, page errors, hydration)", "smoke:routes", []],
];

const results = [];
for (const [title, script, extra] of steps) {
  const started = Date.now();
  const run = spawnSync("npm", ["run", "-s", script, "--", ...extra], { encoding: "utf8", env: { ...process.env, SMOKE_URL: candidate }, maxBuffer: 64 * 1024 * 1024 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  results.push({ title, script, ok: run.status === 0, seconds: Math.round((Date.now() - started) / 1000), tail: output.split("\n").slice(-14).join("\n") });
  console.log(`${run.status === 0 ? "ok  " : "FAIL"} ${title} (${results.at(-1).seconds} s)`);
}
// Route transition QA reads its origin from the environment.
{
  const started = Date.now();
  const run = spawnSync("node", ["scripts/qa-route-transition.mjs"], { encoding: "utf8", env: { ...process.env, ROUTE_TRANSITION_ORIGIN: candidate } });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  results.push({ title: "Page transitions", script: "qa-route-transition", ok: run.status === 0, seconds: Math.round((Date.now() - started) / 1000), tail: output.split("\n").slice(-6).join("\n") });
  console.log(`${run.status === 0 ? "ok  " : "FAIL"} Page transitions (${results.at(-1).seconds} s)`);
}

const report = [
  `# ${live ? "Quarterly audit" : "Release gate"} — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  "",
  `Candidate: ${candidate}${live ? "" : ` · reference: ${base}`}`,
  "",
  "| Check | Result | Time |",
  "|---|---|---|",
  ...results.map((result) => `| ${result.title} | ${result.ok ? "✅ pass" : "❌ fail"} | ${result.seconds} s |`),
  "",
  "## Design review (by eye, docs/design-review.md)",
  "",
  live ? "- Walk the hubs and one detail page per section on a phone and a desktop." : `- Open every diff in \`${outDir}/visual\` that is not 0.00 % and confirm the change is intended.`,
  "- Hierarchy, honest states, one focal point per section, artwork hero over a solid body (design.md).",
  "",
  ...results.flatMap((result) => [`### ${result.title}`, "", "```", result.tail, "```", ""]),
].join("\n");
fs.writeFileSync(`${outDir}/report.md`, report);
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${failed ? `qa:release — ${failed} check(s) failed` : "qa:release — every check passed"}; report: ${outDir}/report.md`);
process.exit(failed ? 1 : 0);
