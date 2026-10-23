#!/usr/bin/env node
/**
 * Run a noisy command (build, typecheck, tests) and print only a verdict.
 *
 *   node scripts/quiet.mjs <label> -- <command…>
 *   npm run build:quiet            (root package.json)
 *
 * The full output goes to .artifacts/logs/<label>-<time>.log. Stdout gets:
 *   - one verdict line (OK/FAIL, exit code, duration, log path);
 *   - on success the last few lines (build summary);
 *   - on failure the distinct error-looking lines and the tail.
 * The command runs through the shared server queue (`gildra-heavy`: 2 slots, nice/ionice) when it exists
 * (GILDRA_HEAVY=/path overrides, GILDRA_HEAVY=off bypasses); otherwise directly.
 * Exit code is the command's. Tune with QUIET_TAIL (default 8 ok / 25 fail) and QUIET_ERRORS (default 40).
 */
import { spawn } from "node:child_process";
import { accessSync, constants, createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || sep === argv.length - 1) {
  console.error("usage: node scripts/quiet.mjs <label> -- <command…>");
  process.exit(2);
}
const label = argv[0].replace(/[^a-z0-9._-]+/gi, "-");
const command = argv.slice(sep + 1).join(" ");

const logDir = path.resolve(".artifacts/logs");
mkdirSync(logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const logPath = path.join(logDir, `${label}-${stamp}.log`);
const log = createWriteStream(logPath);

const ERROR_LINE = /(\berror\b|\bfailed\b|\bfail\b|✖|✘|✗|\bERR_|Type error|TS\d{4}|Module not found|panic:|\bFAIL\b|not ok |ELIFECYCLE|Unhandled)/i;
const tailOk = Number(process.env.QUIET_TAIL ?? 8);
const tailFail = Number(process.env.QUIET_TAIL ?? 25);
const maxErrors = Number(process.env.QUIET_ERRORS ?? 40);

function findHeavy() {
  const pref = process.env.GILDRA_HEAVY;
  if (pref === "off") return null;
  const candidates = [pref, path.join(process.env.HOME ?? "", "bin/gildra-heavy"), ...(process.env.PATH ?? "").split(":").map((d) => path.join(d, "gildra-heavy"))];
  for (const c of candidates) {
    if (!c) continue;
    try {
      accessSync(c, constants.X_OK);
      return c;
    } catch {}
  }
  return null;
}
const heavy = findHeavy();

const lines = [];
let partial = "";
const started = Date.now();
const spawnOpts = { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } };
const child = heavy ? spawn(heavy, ["bash", "-c", command], spawnOpts) : spawn(command, { ...spawnOpts, shell: true });

function onData(chunk) {
  log.write(chunk);
  const text = partial + chunk.toString();
  const parts = text.split(/\r?\n/);
  partial = parts.pop() ?? "";
  for (const line of parts) lines.push(line);
}
child.stdout.on("data", onData);
child.stderr.on("data", onData);

child.on("close", (code, signal) => {
  if (partial) lines.push(partial);
  log.end();
  const ok = code === 0;
  const secs = (Date.now() - started) / 1000;
  const dur = secs >= 60 ? `${Math.floor(secs / 60)}m${Math.round(secs % 60)}s` : `${secs.toFixed(1)}s`;
  const rel = path.relative(process.cwd(), logPath);
  console.log(`[quiet] ${label} ${ok ? "OK" : "FAIL"} exit=${code ?? signal} ${dur}${heavy ? " (queued via gildra-heavy)" : ""} lines=${lines.length} log=${rel}`);
  const nonEmpty = lines.filter((l) => l.trim());
  if (ok) {
    console.log(nonEmpty.slice(-tailOk).join("\n"));
  } else {
    const seen = new Set();
    const errors = [];
    for (const l of nonEmpty) {
      const key = l.trim().slice(0, 160);
      if (ERROR_LINE.test(l) && !/\bwarning\b/i.test(l) && !seen.has(key)) {
        seen.add(key);
        errors.push(l.length > 300 ? `${l.slice(0, 300)}…` : l);
      }
    }
    if (errors.length) console.log(`-- ${Math.min(errors.length, maxErrors)} of ${errors.length} error lines --\n${errors.slice(0, maxErrors).join("\n")}`);
    console.log(`-- tail --\n${nonEmpty.slice(-tailFail).join("\n")}`);
    console.log(`(full output: ${rel}; inspect with grep -n / sed -n ranges, do not cat it)`);
  }
  process.exit(ok ? 0 : (code ?? 1));
});
