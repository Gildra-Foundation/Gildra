import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Compile the small pure modules in memory; no Next server or network is needed.
function load(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    assert(name in dependencies, `Unexpected runtime dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const i18n = load("../lib/i18n.ts");
const { localizeRotationCatalog, localizeRotationResult, mergeRotationAbility, rotationComboName, rotationResourceLabel } = load("../lib/platform/rotation/locale.ts", { "@/lib/i18n": i18n });
const { resolveRotationAbilitySpellId } = load("../lib/platform/rotation/spellIds.ts");

assert.equal(resolveRotationAbilitySpellId("bloodbath"), undefined, "A transformed ability must not inherit the base spell's identity");
assert.equal(resolveRotationAbilitySpellId("crushing-blow"), undefined);
assert.equal(resolveRotationAbilitySpellId("bloodbath", 123456), 123456, "An actual source spell ID stays authoritative");

assert.equal(rotationResourceLabel("runic_power", "ru"), "Сила рун");
assert.equal(rotationResourceLabel("Ярость", "en"), "Rage");
assert.equal(rotationResourceLabel("unrecognized-resource", "ru"), "unrecognized-resource");

const tree = (choices) => ({ trees: { class: { nodes: [{ choices }] }, spec: { nodes: [] }, hero: { nodes: [] } } });
const english = tree([{ externalId: 1, spellId: 101, name: "Source Ability", description: "English description" }, { externalId: 2, spellId: 102, name: "Source Buff", description: "Buff description" }]);
const russian = tree([{ externalId: 1, spellId: 101, name: "Имя из источника", description: "Описание из источника" }, { externalId: 2, spellId: 102, name: "Эффект из источника", description: "Описание эффекта" }]);
const preset = { locale: "en", abilities: [{ id: "source-ability", name: "Source Ability", hint: "SimC action", iconUrl: "icon" }, { id: "missing-action", name: "Missing Action", hint: "Source fallback", iconUrl: "icon" }], defaultRules: ["source-ability"], aplOptions: { resources: ["rage"], buffs: ["source_buff"], cooldowns: ["source-ability"] } };
const localized = localizeRotationCatalog(preset, english, russian, "ru");
assert.equal(localized.abilities[0].id, "source-ability", "Simulation action IDs must remain canonical");
assert.equal(localized.abilities[0].name, "Имя из источника");
assert.equal(localized.abilities[0].hint, "Описание из источника");
assert.equal(localized.abilities[0].spellId, 101);
assert.equal(localized.abilities[1].name, "Missing Action", "Never invent a translation when the source lacks it");
assert.equal(localized.aplOptions.buffs, preset.aplOptions.buffs, "APL inputs must not be translated");
assert.equal(localized.gameLabels.sourcebuff, "Эффект из источника");
assert.equal(localizeRotationCatalog(preset, english, english, "en").abilities[0].name, "Source Ability");
assert.equal(preset.abilities[0].name, "Source Ability", "Localization must not mutate shared presets");

const incoming = { ...preset.abilities[0], spellId: 101 };
assert.equal(mergeRotationAbility(localized.abilities[0], incoming).name, "Имя из источника", "Simulation/saved English payloads must not overwrite the selected catalog locale");
assert.equal(mergeRotationAbility(localized.abilities[0], incoming).hint, "Описание из источника");
assert.equal(mergeRotationAbility(undefined, incoming).name, "Source Ability");

const combo = { name: "My personally named Execute", buildName: "Build", scenario: "execute", targetCount: 1 };
for (const nameSource of [undefined, "custom"]) assert.equal(rotationComboName({ ...combo, nameSource }, "ru"), combo.name, "User and legacy names must remain intact");
assert.equal(rotationComboName({ ...combo, nameSource: "generated" }, "ru", "Текущий билд"), "Текущий билд · Добивание");
assert.equal(rotationComboName({ ...combo, nameSource: "generated" }, "en", "Current build"), "Current build · Execute");

const result = { dps: 12345, metrics: [{ label: "Runic Power Efficiency", value: "95%" }], casts: [{ abilityId: "source-ability", time: 0 }], rage: [], resourceLabel: "Rage", resources: [{ key: "rage", label: "Rage", maximum: 100, points: [] }], cooldowns: [{ abilityId: "source-ability", name: "Source Ability", uses: [0] }], procs: [{ name: "Source Buff" }], findings: [{ title: "Rage Overflow", detail: "Observed resource efficiency was 92.5% in the reference simulation." }] };
const display = localizeRotationResult(result, localized.abilities, "ru", localized.gameLabels);
assert.equal(display.resourceLabel, "Ярость");
assert.equal(display.cooldowns[0].name, "Имя из источника");
assert.equal(display.procs[0].name, "Эффект из источника");
assert.equal(display.findings[0].title, "Ярость: переполнение");
assert.equal(display.findings[0].detail, "Эффективность ресурса в эталонном расчёте: 92.5%.");
assert.equal(display.metrics[0].label, "Сила рун: эффективность");
assert.equal(display.dps, result.dps);
assert.equal(display.casts, result.casts, "Display localization must not rewrite the combat trace");
assert.equal(result.resourceLabel, "Rage", "Keep engine responses unchanged");

console.log(JSON.stringify({ status: "passed", officialCatalogMatching: true, languageSwitch: true, savedNamesPreserved: true, combatDataUnchanged: true }));
