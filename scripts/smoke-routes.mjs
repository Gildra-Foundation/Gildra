#!/usr/bin/env node
/**
 * Route smoke for the built site (roadmap 94), run in CI after `npm run build`.
 *
 * Opens the main EN/RU routes in Chromium and fails on an unexpected HTTP
 * status, an uncaught page error (hydration mismatches such as React #418
 * included) or a 5xx from the site's own requests. CI has no API, so pages
 * must render their "unavailable" states instead of failing.
 *
 *   npm run build && npm run smoke:routes            # starts `next start` itself
 *   SMOKE_URL=https://gildra.net npm run smoke:routes # or checks a running site
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.SMOKE_PORT ?? 3199);
const origin = process.env.SMOKE_URL ?? `http://127.0.0.1:${port}`;

// [path, expected status]
const routes = [
  ["/", 200], ["/ru", 200], ["/wow", 200], ["/ru/wow", 200],
  ["/tier-lists", 200], ["/ru/tier-lists", 200],
  ["/wow/raids", 200], ["/ru/wow/raids", 200], ["/wow/raids/the-voidspire", 200],
  ["/wow/mythic-plus", 200], ["/ru/wow/mythic-plus", 200],
  ["/wow/classes", 200], ["/wow/lairs", 200], ["/ru/wow/lairs", 200],
  ["/wow/characters", 200], ["/wow/articles", 200],
  ["/talents/fury-warrior", 200],
  ["/database", 200], ["/ru/database", 200], ["/search", 200], ["/search?q=Thunderfury", 200],
  ["/privacy", 200], ["/ru/privacy", 200],
  ["/foo", 404], ["/ru/foo", 404], ["/wow/raids/no-such-raid", 404],
];
const plain = [["/robots.txt", 200], ["/sitemap.xml", 200]];

async function startServer() {
  if (process.env.SMOKE_URL) return null;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) },
  });
  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk; });
  server.stderr.on("data", (chunk) => { log += chunk; });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${origin}/robots.txt`)).ok) return server;
    } catch {
      // not listening yet
    }
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  server.kill();
  throw new Error(`next start did not come up on ${origin}\n${log.slice(-2000)}`);
}

const failures = [];
const server = await startServer();
const browser = await chromium.launch();
try {
  for (const [path, expected] of plain) {
    const response = await fetch(origin + path);
    if (response.status !== expected) failures.push(`${path}: HTTP ${response.status}, want ${expected}`);
  }
  for (const [path, expected] of routes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const problems = [];
    page.on("pageerror", (error) => problems.push(`page error: ${error.message.split("\n")[0]}`));
    page.on("console", (message) => {
      // Hydration mismatches only: #441 is a server component error that an
      // error.tsx boundary rendered (e.g. /database while the API is down).
      if (message.type() === "error" && /Minified React error #(418|419|421|422|423|425)\b|hydrat/i.test(message.text())) {
        problems.push(`console: ${message.text().split("\n")[0]}`);
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (url.startsWith(origin) && response.status() >= 500) problems.push(`HTTP ${response.status()} ${url.slice(origin.length)}`);
    });
    const started = Date.now();
    const response = await page.goto(origin + path, { waitUntil: "load", timeout: 60000 }).catch((error) => {
      problems.push(`navigation: ${error.message.split("\n")[0]}`);
      return null;
    });
    await page.waitForTimeout(800);
    const status = response?.status();
    if (status !== expected) problems.unshift(`HTTP ${status}, want ${expected}`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${String(status).padEnd(3)} ${path} (${Date.now() - started} ms)`);
    for (const problem of problems) failures.push(`${path}: ${problem}`);
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`\nsmoke: ${routes.length + plain.length} routes ok`);
