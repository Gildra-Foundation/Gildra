#!/usr/bin/env node
/**
 * Gildra wrapper around the pinned valyro-cli. Registry sources are installed into a scratch
 * project first, then copied into packages/atlas-ui or cms with LF endings, the recorded Gildra
 * adaptations re-applied and registry-manifest.json updated. Adapted files are never replaced
 * by pristine registry source.
 *
 *   node scripts/valyro.mjs check                      offline: snapshot matches its manifest
 *   node scripts/valyro.mjs drift [--target t]         online: what changed in the registry since the snapshot
 *   node scripts/valyro.mjs add <name...> [--target t] [--update] [--dry-run]
 *   node scripts/valyro.mjs update [--target t] [--dry-run]
 *
 * Targets: atlas (default for add), cms, all (default for check/drift/update).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CLI = "valyro-cli@0.1.0";
export const REGISTRY = "https://valyro.xyz/r";
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TARGETS = {
  atlas: { root: "packages/atlas-ui", consumer: "apps/web/package.json", workspace: "@gildra/web" },
  cms: { root: "cms", consumer: "cms/package.json", workspace: null },
};
/** Gildra files inside an install dir that are not registry source. */
const LOCAL_FILES = new Set(["README.md", "registry-manifest.json"]);

/**
 * Codified adaptations: literal replacements applied to pristine registry source. Each pair must
 * match at least once, otherwise the file needs a manual merge. Adaptations without an entry here
 * (the Pro AnalyticsFilterBar visibility flags) are always merged by hand.
 */
const SCOPE = {
  "styles/tokens.css": { pairs: [[":where(:root, [data-theme])", ":where(.gd-valyro, [data-theme])"]] },
  "styles/themes/vercel.css": { pairs: [[":root", ".gd-valyro"]] },
  "styles/base.css": { pairs: [["html[data-theme]", ".gd-valyro[data-theme]"]] },
};
export const ADAPTATIONS = {
  atlas: {
    ...SCOPE,
    "styles/base.css": { ...SCOPE["styles/base.css"], trimTrailingBlank: true },
    "primitives/motion.css": { pairs: [[":root", ".gildra-atlas,\n[data-atlas-scope]"]] },
  },
  cms: SCOPE,
};

export const sha256 = text => createHash("sha256").update(text).digest("hex");
export const toLf = text => text.replace(/\r\n?/g, "\n");

/** @returns {string | null} adapted content, or null when an anchor is missing (manual merge). */
export function adapt(content, rule) {
  let out = content;
  for (const [from, to] of rule.pairs) {
    if (!out.includes(from)) return null;
    out = out.split(from).join(to);
  }
  return rule.trimTrailingBlank ? out.replace(/\n+$/, "\n") : out;
}

/** Inverse of adapt for the recorded snapshot; tests use it to prove the rules reproduce the registry hashes. */
export function unadapt(content, rule) {
  let out = content;
  for (const [from, to] of [...rule.pairs].reverse()) out = out.split(to).join(from);
  return rule.trimTrailingBlank ? `${out}\n` : out;
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file, base) : [path.relative(base, file).split(path.sep).join("/")];
  });
}

export function loadTarget(name, cwd = project) {
  const spec = TARGETS[name];
  if (!spec) throw new Error(`Unknown target "${name}" (atlas, cms, all)`);
  const root = path.join(cwd, spec.root);
  const config = JSON.parse(fs.readFileSync(path.join(root, "valyro.json"), "utf8"));
  const installDir = path.join(root, config.installDir);
  const manifestFile = path.join(installDir, "registry-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  return { name, spec, root, config, installDir, manifestFile, manifest, rules: ADAPTATIONS[name] };
}

/** Offline consistency of one target; returns a list of problems. */
export function checkTarget(target) {
  const problems = [];
  const { config, installDir, manifest, rules } = target;
  const label = p => `${target.name}: ${p}`;
  if (config.registry !== REGISTRY) problems.push(label(`valyro.json registry must be ${REGISTRY}`));
  if (config.rsc !== true) problems.push(label("valyro.json rsc must be true (sources keep 'use client')"));
  const byPath = new Map(manifest.files.map(file => [file.path, file]));
  for (const file of manifest.files) {
    const abs = path.join(installDir, file.path);
    if (!fs.existsSync(abs)) {
      problems.push(label(`${file.path} is in the manifest but missing`));
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    if (content.includes("\r")) problems.push(label(`${file.path} has CR line endings`));
    const hash = sha256(content);
    if (hash !== file.installedSha256) problems.push(label(`${file.path} changed without a manifest update (installedSha256)`));
    if (file.adapted !== (file.installedSha256 !== file.registrySha256)) problems.push(label(`${file.path} "adapted" flag disagrees with its hashes`));
    if (file.adapted && !manifest.adaptations?.[file.path]) problems.push(label(`${file.path} is adapted but has no adaptations entry`));
    const rule = rules[file.path];
    if (rule && file.adapted && sha256(unadapt(content, rule)) !== file.registrySha256) {
      problems.push(label(`${file.path} no longer matches its codified adaptation in scripts/valyro.mjs`));
    }
  }
  for (const rel of walk(installDir)) {
    if (!LOCAL_FILES.has(rel) && !byPath.has(rel)) problems.push(label(`${rel} is not recorded in registry-manifest.json (install through npm run valyro:add)`));
  }
  for (const pro of manifest.proComponents ?? []) {
    if (!manifest.components.includes(pro)) problems.push(label(`Pro component ${pro} is not in components`));
  }
  return problems;
}

export function hasToken(env = process.env) {
  if (env.VALYRO_TOKEN) return true;
  const dir = env.VALYRO_CONFIG_DIR ?? path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "valyro");
  return fs.existsSync(path.join(dir, "auth.json"));
}

/** Installs `names` with the pinned CLI into a scratch project; returns LF-normalized files. */
function stage(target, names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gildra-valyro-${target.name}-`));
  fs.writeFileSync(path.join(dir, "valyro.json"), `${JSON.stringify(target.config, null, 2)}\n`);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["-y", CLI, "add", ...names, "--cwd", dir, "--yes", "--skip-install"], { encoding: "utf8" });
  if (result.error) throw new Error(`Cannot run npx (${result.error.message}). Put Node 22 npm/npx on PATH, see docs/llm/valyro-cli.md.`);
  if (result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`${CLI} add failed:\n${result.stderr || result.stdout}`);
  }
  const resolved = /^Resolved (.+)$/m.exec(result.stdout)?.[1].split(", ") ?? names;
  const packages = [...result.stdout.matchAll(/^Install the required packages: \S+ (?:install|add) (.+)$/gm)]
    .flatMap(match => match[1].split(" ").filter(arg => !arg.startsWith("-")));
  const installDir = path.join(dir, target.config.installDir);
  const files = new Map(walk(installDir).map(rel => [rel, toLf(fs.readFileSync(path.join(installDir, rel), "utf8"))]));
  return { dir, installDir, resolved, packages, files };
}

/**
 * Pure planning step. For each staged file: create, keep, update (pristine file outdated),
 * readapt (adapted file, codified rule applied to the new upstream) or manual.
 */
export function planSync({ staged, local, manifest, rules }) {
  const byPath = new Map(manifest.files.map(file => [file.path, file]));
  const actions = [];
  for (const [rel, upstream] of staged) {
    const registrySha256 = sha256(upstream);
    const entry = byPath.get(rel);
    const current = local.get(rel) ?? null;
    if (current === null) {
      actions.push({ kind: "create", path: rel, content: upstream, registrySha256 });
    } else if (!entry) {
      actions.push({ kind: "untracked", path: rel, registrySha256 });
    } else if (registrySha256 === entry.registrySha256) {
      actions.push({ kind: "same", path: rel, registrySha256 });
    } else if (!entry.adapted) {
      actions.push({ kind: "update", path: rel, content: upstream, registrySha256 });
    } else {
      const content = rules[rel] ? adapt(upstream, rules[rel]) : null;
      actions.push(content === null ? { kind: "manual", path: rel, registrySha256 } : { kind: "readapt", path: rel, content, registrySha256 });
    }
  }
  const removed = manifest.files.filter(file => !staged.has(file.path)).map(file => file.path);
  return { actions, removed };
}

function localFiles(target, paths) {
  return new Map(paths.map(rel => {
    const abs = path.join(target.installDir, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  }));
}

function consumerMissing(target, packages) {
  const pkg = JSON.parse(fs.readFileSync(path.join(project, target.spec.consumer), "utf8"));
  const declared = new Set(["dependencies", "devDependencies", "peerDependencies"].flatMap(field => Object.keys(pkg[field] ?? {})));
  const name = spec => (spec.startsWith("@") ? `@${spec.slice(1).split("@")[0]}` : spec.split("@")[0]);
  return [...new Set(packages)].filter(spec => !declared.has(name(spec)));
}

function summary(actions) {
  const counts = {};
  for (const action of actions) counts[action.kind] = (counts[action.kind] ?? 0) + 1;
  return Object.entries(counts).map(([kind, n]) => `${n} ${kind}`).join(", ") || "nothing";
}

function stageableComponents(target, names) {
  const pro = new Set(target.manifest.proComponents ?? []);
  if (hasToken()) return { names, skipped: [] };
  return { names: names.filter(name => !pro.has(name)), skipped: names.filter(name => pro.has(name)) };
}

function drift(target) {
  const { names, skipped } = stageableComponents(target, target.manifest.components);
  const staged = stage(target, names);
  try {
    const { actions, removed } = planSync({ staged: staged.files, local: localFiles(target, [...staged.files.keys()]), manifest: target.manifest, rules: target.rules });
    const changed = actions.filter(action => action.kind !== "same");
    console.log(`${target.name}: ${summary(actions)}${removed.length ? `, ${removed.length} not in the registry any more or Pro-only` : ""}`);
    for (const action of changed) console.log(`  ${action.kind.padEnd(9)} ${action.path}`);
    if (skipped.length) console.log(`  Pro components not compared (run npm run valyro:login): ${skipped.join(", ")}`);
    return changed.length;
  } finally {
    fs.rmSync(staged.dir, { recursive: true, force: true });
  }
}

function sync(target, requested, { update, dryRun }) {
  const proRequested = requested.filter(name => (target.manifest.proComponents ?? []).includes(name));
  if (proRequested.length && !hasToken()) throw new Error(`${proRequested.join(", ")}: Pro. Run npm run valyro:login first.`);
  const staged = stage(target, requested);
  let keepStage = false;
  try {
    const { actions } = planSync({ staged: staged.files, local: localFiles(target, [...staged.files.keys()]), manifest: target.manifest, rules: target.rules });
    console.log(`${target.name}: resolved ${staged.resolved.join(", ")}`);
    console.log(`${target.name}: ${summary(actions)}`);
    for (const action of actions.filter(a => a.kind !== "same")) console.log(`  ${action.kind.padEnd(9)} ${action.path}`);

    const untracked = actions.filter(a => a.kind === "untracked");
    if (untracked.length) throw new Error(`${target.name}: files exist but are not in registry-manifest.json; record or remove them first.`);
    const outdated = actions.filter(a => a.kind === "update" || a.kind === "readapt" || a.kind === "manual");
    if (outdated.length && !update) {
      throw new Error(
        `${target.name}: the snapshot is older than the registry for files these components depend on. ` +
          "Mixing versions breaks the kit: run npm run valyro:update (or add --update) and review the diff.",
      );
    }
    const missing = consumerMissing(target, staged.packages);
    if (dryRun) {
      if (missing.length) console.log(`  would need npm packages: ${missing.join(" ")}`);
      return;
    }

    const byPath = new Map(target.manifest.files.map(file => [file.path, file]));
    for (const action of actions) {
      if (!("content" in action)) continue;
      const abs = path.join(target.installDir, action.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, action.content);
      const record = { path: action.path, registrySha256: action.registrySha256, installedSha256: sha256(action.content), adapted: action.kind === "readapt" };
      if (byPath.has(action.path)) Object.assign(byPath.get(action.path), record);
      else target.manifest.files.push(record);
    }
    const manual = actions.filter(a => a.kind === "manual");
    const manifest = target.manifest;
    manifest.registry = REGISTRY;
    manifest.cli = CLI;
    manifest.retrievedAt = new Date().toISOString();
    manifest.components = [...new Set([...manifest.components, ...staged.resolved])];
    fs.writeFileSync(target.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    if (manual.length) {
      keepStage = true;
      console.log(`\n${target.name}: merge by hand (kept the Gildra version; upstream is in ${staged.installDir}):`);
      for (const action of manual) {
        console.log(`  diff -u ${path.join(target.installDir, action.path)} ${path.join(staged.installDir, action.path)}`);
      }
      console.log("Then set registrySha256 to the new upstream hash and installedSha256 to the merged file's hash in the manifest.");
    }
    if (missing.length) {
      const where = target.spec.workspace ? ` -w ${target.spec.workspace}` : ` --prefix ${target.spec.root}`;
      console.log(`\nNot installed (needs owner review): npm install${where} ${missing.join(" ")}`);
    }
    if (target.name === "atlas") {
      const result = spawnSync(process.execPath, [path.join(project, "scripts/generate-public-valyro-theme.mjs")], { stdio: "inherit" });
      if (result.status !== 0) throw new Error("npm run valyro:generate failed");
    }
  } finally {
    if (!keepStage) fs.rmSync(staged.dir, { recursive: true, force: true });
  }
}

function parse(argv) {
  const opts = { names: [], target: null, update: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target") opts.target = argv[++i];
    else if (arg.startsWith("--target=")) opts.target = arg.slice(9);
    else if (arg === "--update") opts.update = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`);
    else opts.names.push(arg);
  }
  return opts;
}

const targetsOf = (value, fallback) => {
  const name = value ?? fallback;
  return name === "all" ? Object.keys(TARGETS) : [name];
};

function main([command, ...argv]) {
  const opts = parse(argv);
  if (command === "check") {
    const problems = targetsOf(opts.target, "all").flatMap(name => checkTarget(loadTarget(name)));
    for (const problem of problems) console.error(problem);
    if (!problems.length) console.log("Valyro snapshots match their manifests.");
    return problems.length ? 1 : 0;
  }
  if (command === "drift") {
    targetsOf(opts.target, "all").forEach(name => drift(loadTarget(name)));
    return 0;
  }
  if (command === "add") {
    if (!opts.names.length) throw new Error("Usage: npm run valyro:add -- <name...> [--target atlas|cms|all] [--update] [--dry-run]");
    targetsOf(opts.target, "atlas").forEach(name => sync(loadTarget(name), opts.names, opts));
    return 0;
  }
  if (command === "update") {
    for (const name of targetsOf(opts.target, "all")) {
      const target = loadTarget(name);
      const { names, skipped } = stageableComponents(target, target.manifest.components);
      if (skipped.length) console.log(`${name}: Pro components kept as they are (run npm run valyro:login to update them): ${skipped.join(", ")}`);
      sync(target, names, { ...opts, update: true });
    }
    return 0;
  }
  console.error("Usage: node scripts/valyro.mjs check | drift | add <name...> | update  [--target atlas|cms|all] [--update] [--dry-run]");
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
