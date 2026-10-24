// Loopback-only Next harness of the actual component; every HTTP result is synthetic.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL("../../../../", import.meta.url));
const web = path.join(project, "apps/web");
const root = path.join(project, ".artifacts/farm-upgrades", String(Date.now()));
const harness = path.join(root, "harness");
const port = Number(process.env.FARM_UI_PORT ?? 58127), url = `http://127.0.0.1:${port}`;
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error("Invalid private port");
mkdirSync(path.join(harness, "app"), { recursive: true });
symlinkSync(path.join(project, "node_modules"), path.join(harness, "node_modules"));
writeFileSync(path.join(harness, "package.json"), JSON.stringify({ private: true, name: "private-synthetic-farm-tests" }));
writeFileSync(path.join(harness, "next.config.mjs"), `export default {reactStrictMode:true,devIndicators:false,outputFileTracingRoot:${JSON.stringify(project)},webpack(c){c.resolve.alias['@']=${JSON.stringify(web)};return c}};`);
writeFileSync(path.join(harness, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020", jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", esModuleInterop: true, resolveJsonModule: true, skipLibCheck: true, paths: { "@/*": [web + "/*"] } } }));
const fontSource = process.env.FARM_UI_FONT_DIR;
if (!fontSource) throw Error("Set FARM_UI_FONT_DIR to the actual Inter/Alegreya font bundle");
const fonts = JSON.parse(readFileSync(path.join(fontSource, "manifest.json"), "utf8"));
mkdirSync(path.join(harness, "public/audit-fonts"), { recursive: true });
for (const font of fonts.fonts) copyFileSync(path.join(fontSource, font.file), path.join(harness, "public/audit-fonts", font.file));
writeFileSync(path.join(harness, "app/fonts.css"), fonts.fonts.map(font => font.css).join("\n") + '\n:root{--font-ui:"Inter";--font-atlas-display:"Alegreya";--font-display:"Alegreya"}');
writeFileSync(path.join(harness, "app/layout.tsx"), `import '@/app/globals.css';import './fonts.css';export default function Layout({children}){return <html className="gildra-atlas"><body>{children}</body></html>}`);
writeFileSync(path.join(harness, "app/page.tsx"), `import {FarmPanels} from ${JSON.stringify(path.join(web, "tests/farm-upgrades/harness"))};export const dynamic='force-dynamic';export default async function Page({searchParams}){const q=await searchParams;return <main className="gildra-atlas" data-atlas-scope style={{maxWidth:1000,margin:'auto',padding:16}}><p>Private synthetic farming fixtures — no live character or loot data.</p><FarmPanels locale={q.lang==='ru'?'ru':'en'}/></main>}`);
const finish = child => new Promise((resolve, reject) => { child.once("exit", code => resolve(code)); child.once("error", reject); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Refuse an already occupied port: tests may only use this run's own server.
const net = await import("node:net");
await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once("error", reject); probe.listen(port, "127.0.0.1", () => probe.close(resolve)); });
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
  { cwd: harness, detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
const stopped = finish(server);
let log = ""; server.stdout.on("data", data => { log += data; }); server.stderr.on("data", data => { log += data; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Private server stopped");
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  if (!ready) throw Error("Private harness timed out");
  const tests = spawn(process.execPath, [path.join(path.dirname(require.resolve("playwright")), "cli.js"), "test", "--config", path.join(web, "tests/farm-upgrades/ui.config.ts")],
    { cwd: web, stdio: "inherit", env: { ...process.env, FARM_UI_BASE_URL: url, FARM_UI_REPORT: path.join(root, "report.json"), FARM_UI_RESULTS: path.join(root, "results") } });
  process.exitCode = Number(await finish(tests)) || 0;
  console.log(JSON.stringify({ report: path.join(root, "report.json"), syntheticOnly: true }));
} finally {
  if (server.exitCode === null) process.kill(-server.pid, "SIGTERM");
  await Promise.race([stopped, delay(5000)]);
  writeFileSync(path.join(root, "server.log"), log);
}
