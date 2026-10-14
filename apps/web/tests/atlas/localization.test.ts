import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogLocaleView } from "../../lib/catalogLocale.ts";
import { sourceSpellNames } from "../../lib/wow/sourceSpellNames.ts";
import { wowRouteText } from "../../lib/wow/routeSourceLocale.ts";
import { getDungeonSelectorOptions, getDungeonRoute } from "../../components/wow/mythic/dungeonRoutes.ts";
import { plainLanguage, stopSubtitle } from "../../components/wow/mythic/mythicRouteCopy.ts";
import { initialStops } from "../../components/wow/mythic/rubyLifePoolsData.ts";
import { consoleEnglish } from "../../components/api-console/consoleCopy.ts";
import { rotationResourceLabel } from "../../lib/platform/rotation/locale.ts";
import { langOf, altPath } from "../../lib/i18n-paths.ts";
import { wowSourceName, wowSourceText, wowNpcName, wowSpellName } from "../../lib/wow/sourceLocale.ts";
import { localizeRotationCatalog, mergeRotationAbility, localizeRotationResult, rotationComboName } from "../../lib/platform/rotation/locale.ts";
import type { RotationPreset, RotationSimulationResult, SavedRotationCombo } from "../../lib/platform/rotation/types.ts";

test("catalog display uses requested original fields without changing source data", () => {
  const source = { name: "English original", description: "English description", locale: "ru_RU", resolvedLocale: "en_US", localeFallback: true,
    tooltip: { plainText: "English tooltip" }, localizations: { ru_RU: { name: "Оригинальное название", description: "Исходное описание", resolvedDescription: "Описание с числами" } } };
  const display = catalogLocaleView(source, "ru");
  assert.equal(display.name, "Оригинальное название");
  assert.equal(display.description, "Описание с числами");
  assert.equal(display.tooltip, undefined, "English fallback tooltips must not enter Russian records");
  assert.equal(source.name, "English original");
  assert.equal(source.tooltip.plainText, "English tooltip");
  const missing = catalogLocaleView({ name: "English original", description: "English description", localeFallback: true }, "ru");
  assert.equal(missing.name, "");
  assert.equal(missing.description, "");
  assert.equal(catalogLocaleView({ name: "English original", description: "Description", locale: "en_US" }, "en").name, "English original");
});

test("original names localize labels and prose, while brands and unknown names stay distinct", () => {
  assert.equal(sourceSpellNames[1249262].ru, "Темный коллапс");
  assert.equal(sourceSpellNames[1249262].en, "Umbral Collapse");
  assert.equal(wowSourceName("Murder Row", "ru"), "Закоулок душегубов");
  assert.equal(wowSourceName("Nymrissa Wavecaller", "ru"), "Нимрисса Волногон");
  assert.equal(wowSourceName("Nymrissa Wavecaller", "en"), "Nymrissa Wavecaller");
  assert.equal(wowSourceText("Midnight · Umbral Collapse", "ru"), "Midnight · Темный коллапс");
  assert.equal(wowSourceText("Unknown effect", "ru"), "Unknown effect", "Never manufacture a game translation");
  assert.equal(wowSourceName("Unknown record", "ru"), "Русское название не подтверждено");
});

test("rotation matches spell IDs and preserves locale when saved English payloads arrive", () => {
  const ability = { id: "source-action", spellId: 101, name: "Source name", hint: "Source hint", iconUrl: "icon" };
  const preset = { slug: "fixture", abilities: [ability, { ...ability, id: "unavailable-action", spellId: 102 }], defaultRules: [ability.id] } as RotationPreset;
  const localized = localizeRotationCatalog(preset, new Map([[101, { name: "Название из источника", description: "Описание из источника" }]]), "ru");
  assert.equal(localized.abilities[0].name, "Название из источника");
  assert.equal(localized.abilities[0].spellId, ability.spellId);
  assert.equal(localized.abilities[0].id, ability.id);
  assert.equal(localized.abilities[1].name, "Способность #102");
  assert.equal(mergeRotationAbility(localized.abilities[0], ability).name, "Название из источника");
  assert.equal(preset.abilities[0].name, "Source name");
  const result = { dps: 1000, resourceLabel: "Rage", metrics: [], casts: [], rage: [], findings: [], cooldowns: [{ abilityId: ability.id, name: ability.name, uses: [0] }] } as unknown as RotationSimulationResult;
  const display = localizeRotationResult(result, localized.abilities, "ru");
  assert.equal(display.cooldowns?.[0].name, "Название из источника");
  assert.equal(display.resourceLabel, "Ярость");
  assert.equal(display.dps, result.dps);
  assert.equal(display.casts, result.casts);
});

test("language switching preserves user names and canonical paths", () => {
  const path = "/wow/characters/eu--realm--hero";
  assert.equal(altPath(path, "ru"), "/ru" + path);
  assert.equal(altPath("/ru" + path, "en"), path);
  assert.equal(langOf("/ru/wow"), "ru");
  assert.equal(langOf("/rune"), "en");
  const saved = { name: "My personal билд", nameSource: "custom", buildName: "Build", scenario: "execute", targetCount: 1 } as SavedRotationCombo;
  assert.equal(rotationComboName(saved, "ru"), saved.name);
  assert.equal(rotationComboName({ ...saved, nameSource: "generated" }, "ru", "Текущий билд"), "Текущий билд · Добивание");
});


test("resource names keep their game meaning and console UI translations stay English", () => {
  assert.equal(rotationResourceLabel("Rage", "ru"), "Ярость");
  assert.equal(rotationResourceLabel("Fury", "ru"), "Гнев");
  for (const [source, translated] of Object.entries(consoleEnglish)) {
    assert.ok(!/[А-Яа-яЁё]/.test(translated), `${source}: the English console label contains Russian`);
  }
});

test("deep route names resolve original identities without changing stored keys", () => {
  assert.equal(wowNpcName("Defier Draghar", "ru", 187897), "Драгхар Отрицатель");
  assert.equal(wowNpcName("Flashfrost Chillweaver", "ru", 188067), "Ткач Холода Морозной Вспышки");
  assert.equal(wowSpellName("Cold Claws", "ru", 1305234), "Хладные когти");
  assert.equal(wowSpellName("Cold Claws", "en", 1305234), "Cold Claws");
  assert.equal(wowSpellName("Bloodthirsty Gaze", "ru", 1317906), "Способность #1317906: перевод не подтверждён", "A ru_RU payload with an English name is still untranslated");
  assert.equal(wowRouteText("Cinderweaver + Scorchlings", "ru"), "Пеплоплет воинов стихий + Сполох");
  assert.equal(wowRouteText("Мелидрусса Хладообраз", "ru"), "Мелидрусса Истощенная Холодом");
  assert.equal(wowRouteText("Radiant Drake · переход", "ru"), "дракон для перелёта · переход");
  assert.equal(wowRouteText("Primal Serpents + Harrowers", "en"), "Primal Serpents + Harrowers");
  assert.equal(initialStops[0].enemies[0].name, "Flashfrost Chillweaver");
  assert.equal(initialStops[3].title, "Defier Draghar");
  assert.equal(initialStops[3].forces, 7);
});

test("catalog rejects English text mislabeled as ru_RU without altering the source", () => {
  const source = { name: "Bloodthirsty Gaze", description: "Original English description", locale: "ru_RU", resolvedLocale: "ru_RU", localeFallback: false,
    localizations: { ru_RU: { name: "Bloodthirsty Gaze", description: "Original English description", resolvedDescription: "Original English description" } } };
  const display = catalogLocaleView(source, "ru");
  assert.equal(display.name, "");
  assert.equal(display.description, "");
  assert.equal(source.name, "Bloodthirsty Gaze");
});

test("every built-in route step keeps its Russian display free of untranslated names", () => {
  for (const { slug } of getDungeonSelectorOptions()) {
    const route = getDungeonRoute(slug)!;
    const original = JSON.stringify(route.stops);
    for (const stop of route.stops) {
      const text = [wowRouteText(stop.title, "ru"), stopSubtitle(stop.subtitle, "ru", stop.enemies),
        ...[stop.summary, stop.tank, stop.healer, stop.dps, ...stop.callouts].map((value) => plainLanguage(value))].join(" ");
      assert.equal(/[A-Za-z]/.test(text.replace(/\bID\b/g, "")), false, `${slug} step ${stop.id} has untranslated display text`);
    }
    assert.equal(JSON.stringify(route.stops), original);
  }
});
