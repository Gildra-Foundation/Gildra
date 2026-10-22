import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ADAPTATIONS, TARGETS, adapt, checkTarget, loadTarget, planSync, sha256, toLf, unadapt } from "./valyro.mjs";

test("both Valyro snapshots match their manifests and valyro.json", () => {
  for (const name of Object.keys(TARGETS)) assert.deepEqual(checkTarget(loadTarget(name)), [], name);
});

test("codified adaptations reproduce the recorded registry and installed hashes", () => {
  for (const name of Object.keys(TARGETS)) {
    const target = loadTarget(name);
    const adapted = target.manifest.files.filter(file => file.adapted);
    for (const file of adapted) {
      const rule = target.rules[file.path];
      if (!rule) continue;
      const installed = fs.readFileSync(path.join(target.installDir, file.path), "utf8");
      const pristine = unadapt(installed, rule);
      assert.equal(sha256(pristine), file.registrySha256, `${name}: ${file.path}`);
      assert.equal(adapt(pristine, rule), installed, `${name}: ${file.path}`);
    }
    for (const rel of Object.keys(target.rules)) assert.ok(target.manifest.adaptations[rel], `${name}: ${rel} rule without a manifest description`);
  }
});

test("an adaptation whose anchor disappeared upstream needs a manual merge", () => {
  assert.equal(adapt(".x { color: red; }\n", ADAPTATIONS.cms["styles/themes/vercel.css"]), null);
  assert.equal(adapt(":root { --a: 1; }\n", ADAPTATIONS.cms["styles/themes/vercel.css"]), ".gd-valyro { --a: 1; }\n");
  assert.equal(toLf("a\r\nb\rc\n"), "a\nb\nc\n");
});

test("sync plan keeps adaptations and classifies every staged file", () => {
  const old = { pristine: "a\n", vercel: ":root { --x: 1; }\n", filter: "old\n" };
  const manifest = {
    files: [
      { path: "basic/Same.tsx", registrySha256: sha256(old.pristine), installedSha256: sha256(old.pristine), adapted: false },
      { path: "basic/Old.tsx", registrySha256: sha256(old.pristine), installedSha256: sha256(old.pristine), adapted: false },
      { path: "styles/themes/vercel.css", registrySha256: sha256(old.vercel), installedSha256: "x", adapted: true },
      { path: "charts/AnalyticsFilterBar.tsx", registrySha256: sha256(old.filter), installedSha256: "y", adapted: true },
      { path: "basic/Gone.tsx", registrySha256: "z", installedSha256: "z", adapted: false },
    ],
  };
  const staged = new Map([
    ["basic/Same.tsx", old.pristine],
    ["basic/Old.tsx", "b\n"],
    ["basic/New.tsx", "new\n"],
    ["styles/themes/vercel.css", ":root { --x: 2; }\n"],
    ["charts/AnalyticsFilterBar.tsx", "new filter\n"],
    ["basic/Stray.tsx", "stray\n"],
  ]);
  const local = new Map([...staged.keys()].map(rel => [rel, rel === "basic/New.tsx" ? null : "local\n"]));
  const { actions, removed } = planSync({ staged, local, manifest, rules: ADAPTATIONS.cms });
  const kinds = Object.fromEntries(actions.map(action => [action.path, action.kind]));
  assert.deepEqual(kinds, {
    "basic/Same.tsx": "same",
    "basic/Old.tsx": "update",
    "basic/New.tsx": "create",
    "styles/themes/vercel.css": "readapt",
    "charts/AnalyticsFilterBar.tsx": "manual",
    "basic/Stray.tsx": "untracked",
  });
  assert.equal(actions.find(action => action.kind === "readapt").content, ".gd-valyro { --x: 2; }\n");
  assert.deepEqual(removed, ["basic/Gone.tsx"]);
});
