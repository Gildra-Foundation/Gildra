/** Offline UI regressions: generated private Next harness, real components, synthetic HTTP only. */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const web = path.join(project, "apps/web");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const fontSource = path.resolve(option("--font-source-dir", path.join(project,".artifacts/auction-completion-20261016/ui/font-bundle")));
const phase = option("--phase", "green");
const port = Number(option("--port", "58091"));
const label = option("--label", `ui-${phase}`);
const legacy = args.includes("--legacy");
const selectedProject = option("--project", "");
const selectedWorkers = option("--workers", "");
const grep = option("--grep", phase === "red" ? "regression:" : "");
if (selectedProject && !/^(?:en|ru)-(?:390|1440)$/.test(selectedProject)) throw new Error("Unknown UI matrix project");
if (selectedWorkers && !/^[1-4]$/.test(selectedWorkers)) throw new Error("UI workers must be between one and four");
if (!["red", "green"].includes(phase) || !Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid phase, private port, or artifact label");
if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("The private Next harness requires Node.js 20.9+.");
const root = path.resolve(option("--output-dir", path.join(project, ".artifacts/auction-completion-20261016/ui")));
if (!root.startsWith(path.join(project, ".artifacts") + path.sep)) throw new Error("QA outputs must stay inside this worktree's ignored .artifacts directory");
mkdirSync(root, { recursive: true });
const reportPath = path.join(root, `${label}.json`);
if (existsSync(reportPath)) throw new Error(`Refusing to overwrite existing evidence: ${reportPath}. Use a new --label.`);
const runRoot = path.join(root, `${label}-run-${Date.now()}`), harness = path.join(runRoot, "harness");
if (existsSync(runRoot)) throw new Error(`Refusing to reuse a prior run: ${runRoot}`);
mkdirSync(path.join(harness, "app"), { recursive: true });
const digest = value => createHash("sha256").update(value).digest("hex");
function productHashes() {
  const files = ["apps/web/components/wow/audit/AuctionGearOptimizer.tsx", "apps/web/components/wow/audit/AuctionGearSuggestions.tsx", "apps/web/components/wow/audit/GearPlannerItem.tsx", "apps/web/components/wow/audit/auctionGearOptimizer.module.css", "apps/web/lib/wow/auctionGearRecommendations.ts", "apps/web/lib/wow/auctionGearCoverage.ts", "apps/web/lib/wow/auctionGearCoverageCopy.ts", "apps/web/lib/wow/auctionGearClient.ts", "apps/web/lib/wow/auctionGearFreshness.ts", "apps/web/lib/wow/auctionGearBudget.ts", "apps/web/lib/wow/auctionGearCopy.ts", "apps/web/lib/wow/auctionGearSelectionTransport.ts", "apps/web/app/globals.css", "apps/web/app/styles/site-theme.css", "apps/web/components/wow/audit/WarcraftTooltip.tsx", "apps/web/components/wow/audit/characterAuditPage.module.css", "apps/web/components/wow/audit/characterAtlasProfile.module.css", "apps/web/components/wow/audit/gearPlannerItem.module.css"].filter(file => existsSync(path.join(project,file)));
  return Object.fromEntries(files.map(file => [file, digest(readFileSync(path.join(project, file)))]));
}
const startHashes = productHashes();
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: project }).toString().trim();
const next = require.resolve("next/dist/bin/next");
const cli = path.join(path.dirname(require.resolve("playwright")), "cli.js");
symlinkSync(path.join(project, "node_modules"), path.join(harness, "node_modules"), "dir");
writeFileSync(path.join(harness, "package.json"), JSON.stringify({ name: "gildra-private-auction-reliability", private: true }));
writeFileSync(path.join(harness, "next.config.mjs"), `export default {reactStrictMode:true,devIndicators:false,allowedDevOrigins:['127.0.0.1'],outputFileTracingRoot:${JSON.stringify(project)},webpack(config){config.resolve.alias['@']=${JSON.stringify(web)};return config;}};\n`);
writeFileSync(path.join(harness, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", plugins: [{ name: "next" }], paths: { "@/*": [web + "/*"] } }, include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }, null, 2));
writeFileSync(path.join(harness, "app/layout.tsx"), `import type {ReactNode} from 'react';import '@/app/globals.css';import './qa.css';import './fonts.css';export default function Layout({children}:{children:ReactNode}){return <html lang="en" className="gildra-atlas"><body>{children}</body></html>;}\n`);
writeFileSync(path.join(harness, "app/qa.css"), `.private-auction-qa{max-width:1540px;min-width:0;margin:auto;padding:32px 26px 48px;container:auditPage/inline-size}.private-auction-qa>header{padding-bottom:24px}.private-auction-qa h1{color:var(--atlas-text-strong)}.private-auction-qa [data-character-sections]{display:grid;grid-template-columns:minmax(0,1fr);min-width:0}@media(max-width:820px){.private-auction-qa{padding:24px 16px 40px}}\n`);
const fontManifest = JSON.parse(readFileSync(path.join(fontSource,"manifest.json"),"utf8"));
const fontTarget = path.join(harness,"public/audit-fonts"); mkdirSync(fontTarget,{recursive:true});
for(const font of fontManifest.fonts){if(path.basename(font.file)!==font.file || digest(readFileSync(path.join(fontSource,font.file)))!==font.sha256)throw Error("Invalid actual-font bundle");copyFileSync(path.join(fontSource,font.file),path.join(fontTarget,font.file));}
writeFileSync(path.join(harness,"app/fonts.css"),fontManifest.fonts.map(font=>font.css).join("\n")+'\n:root{--font-ui:"Inter";--font-atlas-display:"Alegreya";--font-display:"Alegreya"}\n');
writeFileSync(path.join(harness, "app/page.tsx"), `import {ReliabilityPanels} from ${JSON.stringify(path.join(web, "tests/auction/reliability/ui-harness"))};export const dynamic='force-dynamic';export default async function Page({searchParams}:{searchParams:Promise<{lang?:string;tooltip?:string;weapon?:string;controls?:string;snapshot?:string}>}){const q=await searchParams;const locale=q.lang==='ru'?'ru':'en';return <main className="gildra-atlas private-auction-qa" data-atlas-scope lang={locale}><header><h1>Offline auction reliability fixtures</h1><p>Private synthetic QA: all characters, lots, prices, effects and DPS are fixtures. No authenticated or native jobs.</p></header><ReliabilityPanels locale={locale} tooltip={q.tooltip==='1'} weapon={q.weapon==='1'} controls={q.controls==='1'} initialRevision={q.snapshot==='1'?1:0}/></main>;}\n`);
await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once("error", reject); probe.listen(port, "127.0.0.1", () => probe.close(resolve)); });
const baseURL = `http://127.0.0.1:${port}`;
const serverArgs = [next, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)];
const report = { status: "running", phase, sourceRevision, startedAt: new Date().toISOString(),
  harnessReactStrictMode: true, actualFontBundle: fontManifest,
  scope: "Versioned Playwright tests of actual current UI in a generated private loopback harness. All market/item/DPS/job facts are synthetic. No auth, upstream/native, or production jobs.",
  sourceFilesSHA256AtStart: startHashes, cases: [], browserErrors: [], unresolvedFailures: [] };
const server = spawn(process.execPath, serverArgs, { cwd: harness, detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PRIVATE_DISABLE_DEV_OVERLAY_UX: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", value => { log += value; }); server.stderr.on("data", value => { log += value; });
const finished = child => new Promise(resolve => { child.once("exit", (code, signal) => resolve({ code, signal })); child.once("error", error => resolve({ code: null, error: String(error) })); });
const serverExit = finished(server);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
try {
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Private harness exited before readiness");
    try { const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) }); if (response.ok) { healthy = true; break; } } catch { /* private compilation is still starting */ }
    await delay(500);
  }
  if (!healthy) throw new Error("Private harness readiness timed out");
  report.listener = execFileSync("ss", ["-H", "-ltnp", `sport = :${port}`]).toString().trim();
  report.server = { pid: server.pid, cwd: readlinkSync(`/proc/${server.pid}/cwd`), argv: readFileSync(`/proc/${server.pid}/cmdline`).toString().split("\0").filter(Boolean), baseURL };
  console.log(`Private synthetic harness ready on ${baseURL}; product revision ${sourceRevision}`);
  const rawPath = path.join(runRoot, "playwright.json");
  const tests = spawn(process.execPath, [cli, "test", "--config", path.join(web, "tests/auction/completion/ui.config.ts"), ...(selectedProject ? ["--project", selectedProject] : []), ...(selectedWorkers ? ["--workers", selectedWorkers] : []), ...(grep ? ["--grep", grep] : [])], { cwd: web, env: { ...process.env,
    AUCTION_COMPLETION_UI_LEGACY:legacy?"1":"", AUCTION_COMPLETION_UI_PHASE:phase, AUCTION_UI_BASE_URL: baseURL, AUCTION_UI_RAW_REPORT: rawPath, AUCTION_UI_RESULTS: path.join(runRoot, "results"), NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit" });
  const execution = await finished(tests);
  report.testExecution = execution;
  if (!existsSync(rawPath)) throw new Error("Playwright did not produce a structured report");
  const raw = JSON.parse(readFileSync(rawPath));
  function collect(suites) { for (const suite of suites ?? []) { for (const spec of suite.specs ?? []) for (const entry of spec.tests ?? []) report.cases.push({ title: spec.title,
    project: entry.projectName, expectedStatus: entry.expectedStatus, status: entry.results.at(-1)?.status,
    errors: entry.results.flatMap(result => result.errors ?? []), attachments: entry.results.flatMap(result => result.attachments ?? []), source: { file: spec.file, line: spec.line } }); collect(suite.suites); } }
  collect(raw.suites);
  report.runnerErrors = raw.errors ?? [];
  if (report.runnerErrors.length || !report.cases.length || report.cases.some(entry => ["interrupted", "skipped"].includes(entry.status))) throw new Error("Regression run incomplete or has runner errors");
  report.allRegressionsRed = report.cases.every(entry => entry.status === "failed");
  report.allRegressionsGreen = report.cases.every(entry => entry.status === "passed");
  report.status = phase === "red" ? report.allRegressionsRed ? "expected-red" : "unexpected-baseline" : report.allRegressionsGreen ? "verified" : "failed";
} catch (error) {
  report.status = "failed"; report.unresolvedFailures.push(String(error));
} finally {
  try {
    if (server.exitCode === null) {
      const cwd = readlinkSync(`/proc/${server.pid}/cwd`), argv = readFileSync(`/proc/${server.pid}/cmdline`).toString().split("\0").filter(Boolean);
      if (cwd !== harness || JSON.stringify(argv.slice(1)) !== JSON.stringify(serverArgs)) throw new Error("Own private harness identity changed; refusing process-group cleanup");
      process.kill(-server.pid, "SIGTERM");
    }
    await Promise.race([serverExit, delay(5000)]);
    const listenerAfter = execFileSync("ss", ["-H", "-ltnp", `sport = :${port}`]).toString().trim();
    if (listenerAfter) throw new Error("Private listener remains after its own process group was stopped");
    report.cleanup = { status: "verified", ownProcessGroup: server.pid, privatePortClosed: true };
  } catch (error) { report.cleanup = { status: "failed", error: String(error) }; report.unresolvedFailures.push(String(error)); }
  report.sourceFilesSHA256AtEnd = productHashes();
  report.productUnchangedDuringRun = JSON.stringify(startHashes) === JSON.stringify(report.sourceFilesSHA256AtEnd);
  if (!report.productUnchangedDuringRun) { report.status = "failed"; report.unresolvedFailures.push("Product source changed during the UI regression run"); }
  writeFileSync(path.join(runRoot, "harness.log"), log);
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, phase, cases: report.cases.length, cleanup: report.cleanup, productUnchangedDuringRun: report.productUnchangedDuringRun, report: reportPath }));
}
process.exitCode = ["verified", "expected-red"].includes(report.status) && report.unresolvedFailures.length === 0 ? 0 : 1;
