import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const i18n = load("../lib/i18n.ts");
const themes = load("../lib/talentSpecThemes.ts");
const audit = load("../lib/wow/characterAudit.ts");
const details = load("../lib/wow/battleNetCharacterDetails.ts");
const { toCharacterAuditSnapshot } = load("../lib/wow/battleNetAuditSnapshot.ts", {
  "@/lib/talentSpecThemes": themes, "./characterAudit": audit, "./battleNetCharacterDetails": details,
});
const { characterProfileFingerprint } = load("../lib/wow/characterProfileFingerprint.ts", { "node:crypto": { createHash } });
const { characterPageText } = load("../components/wow/audit/characterPageCopy.ts");
const base = {
  character: { id: 777, name: "Элкардия", level: 80, realm: { slug: "eversong" }, region: "eu", gender: { type: "FEMALE" }, playableClass: { id: 1 }, playableRace: { id: 10, name: "Blood Elf" }, faction: { name: "Horde" } },
  activeSpec: "Fury", averageItemLevel: 120, equippedItemLevel: 120,
  equipment: [{ id: 123, slot: "Head", slotType: "HEAD", name: "Source item", quality: "EPIC", itemLevel: 120, stats: [], enchantments: ["Source enchant"], sockets: [{ filled: true, label: "Source gem" }], modificationIds: { enchantments: [456], gems: [789] } }],
  recommendations: [], stats: [], modelItems: [], customizations: [], updatedAt: "2026-09-26T10:00:00Z", activeTalentLoadout: "unchanged-loadout",
};
const en = toCharacterAuditSnapshot(base, "en");
const ru = toCharacterAuditSnapshot({ ...base, activeSpec: "Неистовство", equipment: base.equipment.map(item => ({ ...item, slot: "Голова", name: "Предмет из источника", enchantments: ["Чары из источника"], sockets: [{ filled: true, label: "Камень из источника" }] })) }, "ru");
assert.equal(en.character.className, "Warrior · Fury");
assert.equal(ru.character.className, "Воин · Неистовство");
assert.equal(en.specialization.primaryStatLabel, "Strength");
assert.equal(ru.specialization.primaryStatLabel, "Сила");
assert.equal(en.character.name, ru.character.name, "Names must not be translated");
assert.equal(en.slug, ru.slug, "Locale must not change character ownership identity");
assert.equal(en.gear[0].name, base.equipment[0].name, "Item names must come from the source");
assert.equal(en.gear[0].details.quality, ru.gear[0].details.quality, "Internal quality identity must not break existing styles");
assert.equal(characterPageText("en")(en.gear[0].details.quality), "Epic");
assert.equal(characterProfileFingerprint(en), characterProfileFingerprint(ru), "Language must not mark unchanged gear as stale");
assert.notEqual(characterProfileFingerprint(en), characterProfileFingerprint({ ...en, gear: en.gear.map(item => ({ ...item, modificationIds: { enchantments: [999], gems: [789] } })) }), "Real enchant changes must still invalidate results");
assert.notEqual(characterProfileFingerprint(en), characterProfileFingerprint({ ...en, gear: en.gear.map(item => ({ ...item, modificationIds: { enchantments: [456], gems: [999] } })) }), "Real gem changes must still invalidate results");
const path = "/wow/characters/eu--eversong--%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F";
assert.equal(i18n.altPath(path, "ru"), `/ru${path}`);
assert.equal(i18n.altPath(`/ru${path}`, "en"), path);
assert.equal(i18n.altPath(`/ru${path}`, "ru"), `/ru${path}`);
assert.equal(characterPageText("en")("Таланты и симуляция"), "Talents and simulation");
assert.equal(characterPageText("ru")("Таланты и симуляция"), "Таланты и симуляция");
for (const [route, lang] of [["../app/wow/characters/[slug]/page.tsx", "en"], ["../app/ru/wow/characters/[slug]/page.tsx", "ru"]]) {
  const source = readFileSync(new URL(route, import.meta.url), "utf8");
  assert.ok(source.includes(`toCharacterAuditSnapshot(details, "${lang}")`));
  assert.ok(source.includes(`snapshot.activeHeroTalentTreeId, "${lang}"`));
  assert.ok(source.includes('dataMode="battle-net"'));
  assert.ok(source.includes('if (!session?.battleNetAccessToken) redirect('));
  assert.ok(!source.includes("furybarFixture"));
}
for (const [route, lang] of [["../app/wow/characters/page.tsx", "en"], ["../app/ru/wow/characters/page.tsx", "ru"]]) {
  const source = readFileSync(new URL(route, import.meta.url), "utf8");
  assert.ok(source.includes(`locale="${lang}"`));
  assert.ok(source.includes("isConnected={Boolean(session?.battleNetAccessToken)}"), "A connected roster must be keyed to the real Battle.net token, not a display name");
}
for (const [route, lang] of [["../app/login/page.tsx", "en"], ["../app/ru/login/page.tsx", "ru"]]) {
  const source = readFileSync(new URL(route, import.meta.url), "utf8");
  assert.ok(source.includes(`locale="${lang}"`));
  assert.ok(source.includes("isConnected={Boolean(session?.battleNetAccessToken)}"), "Login must not show the sign-in CTA for an already connected session without a display name");
}
const rosterSource = readFileSync(new URL("../components/wow/characters/CharacterRosterPage.tsx", import.meta.url), "utf8");
assert.ok(rosterSource.includes('data-roster-view={isConnected ? apiError ? "error" : "roster" : "entry"}'));
assert.ok(!rosterSource.includes('data-roster-view={accountName'));
const loginSource = readFileSync(new URL("../components/auth/LoginPage.tsx", import.meta.url), "utf8");
assert.ok(loginSource.includes('isConnected ? (ru ? "Аккаунт подключён" : "Account connected")'));
assert.ok(loginSource.includes('const pageTitle = isConnected'));
assert.ok(loginSource.includes('"Книга твоего героя готова." : "Your hero’s folio is ready."'));
assert.ok(loginSource.includes('{!isConnected ? <CharacterEntryProof locale={locale} /> : null}'));
assert.ok(loginSource.includes('{!isConnected ? <CharacterEntryRoadmap locale={locale} /> : null}'));
const workspaceNavSource = readFileSync(new URL("../components/platform/navigation/WorkspaceNavigator.tsx", import.meta.url), "utf8");
assert.ok(workspaceNavSource.includes('Boolean(session?.battleNetAccessToken)'), "The shared sidebar must use the same real Battle.net token state as character pages");
assert.ok(workspaceNavSource.includes('battleNetConnected ? "/wow/characters" : "/login"'), "A connected account shortcut inside the character workspace must return to its real roster");
assert.ok(!workspaceNavSource.includes('"/profile/arcanist"'), "Character navigation must not send a Battle.net user into the unrelated sample-profile route");
const bookNavSource = readFileSync(new URL("../components/platform/navigation/BookNavigationDialog.tsx", import.meta.url), "utf8");
assert.ok(bookNavSource.includes('routePath === "/wow/characters" || routePath.startsWith("/wow/characters/")'));
assert.ok(bookNavSource.includes('characterWorkspace ? "/wow/characters" : "/profile/arcanist"'), "Only the character-book navigation should return connected players to the real Battle.net roster");
const auditPageSource = readFileSync(new URL("../components/wow/audit/CharacterAuditPage.tsx", import.meta.url), "utf8");
assert.ok(auditPageSource.includes('dataMode === "battle-net" ? `${localePrefix}/wow/characters`'), "The live character folio brand must return to the real account roster");
const stateFrameSource = readFileSync(new URL("../components/wow/characters/CharacterBookStateFrame.tsx", import.meta.url), "utf8");
assert.ok(stateFrameSource.includes("lang={locale}"), "Profile loading and error states must expose the same RU/EN language as the surrounding folio");
const profileErrorSource = readFileSync(new URL("../components/wow/characters/CharacterProfileLoadError.tsx", import.meta.url), "utf8");
assert.ok(profileErrorSource.includes("className={styles.leftLeaf}"));
assert.ok(profileErrorSource.includes("className={styles.rightLeaf}"));
const profileErrorCss = readFileSync(new URL("../components/wow/characters/characterProfileLoadError.module.css", import.meta.url), "utf8");
assert.ok(profileErrorCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "A profile error must respect the book's two leaves rather than float over the binding");
assert.ok(profileErrorCss.includes("@container auditPage (max-width: 820px)"), "The error spread must collapse cleanly to one mobile leaf");
console.log(JSON.stringify({ status: "passed", localeCopies: true, authenticatedRoutes: true, rosterAndLoginUseTokenConnection: true, connectedLoginStateIsNotDuplicated: true, characterNavigationReturnsToRoster: true, sourceNamesPreserved: true, sameProfileFingerprint: true, realGearChangesDetected: true, cyrillicSlugRoundTrip: true }));
