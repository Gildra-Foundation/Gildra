// Local-only QA of /wow/characters: the signed-in roster with a fixture account and the guest view.
// Needs a local `next dev` started with AUTH_SECRET=$ROSTER_QA_SECRET and any BATTLENET_CLIENT_ID/SECRET.
// No production code path is involved: the session cookie is signed with the local secret and the
// roster API answer is fulfilled in the browser. Usage:
//   ROSTER_QA_SECRET=… BASE_URL=http://127.0.0.1:5291 OUT=/tmp/roster node scripts/qa-character-roster.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

const base = process.env.BASE_URL || "http://127.0.0.1:5291";
const output = path.resolve(process.env.OUT || path.join(import.meta.dirname, "../.artifacts/character-roster"));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), "fixture sessions are local-only");
assert.ok(process.env.ROSTER_QA_SECRET, "ROSTER_QA_SECRET is required");
fs.mkdirSync(output, { recursive: true });

const classes = {
  1: ["Warrior", "Воин"], 2: ["Paladin", "Паладин"], 3: ["Hunter", "Охотник"], 4: ["Rogue", "Разбойник"], 5: ["Priest", "Жрец"],
  6: ["Death Knight", "Рыцарь смерти"], 7: ["Shaman", "Шаман"], 8: ["Mage", "Маг"], 9: ["Warlock", "Чернокнижник"], 10: ["Monk", "Монах"],
  11: ["Druid", "Друид"], 12: ["Demon Hunter", "Охотник на демонов"], 13: ["Evoker", "Пробудитель"],
};
const races = {
  1: ["Human", "Человек"], 2: ["Orc", "Орк"], 4: ["Night Elf", "Ночной эльф"], 10: ["Blood Elf", "Эльф крови"], 27: ["Nightborne", "Ночнорожденный"],
  52: ["Dracthyr", "Драктир"], 11: ["Draenei", "Дреней"], 8: ["Troll", "Тролль"], 34: ["Dark Iron Dwarf", "Дворф из клана Черного Железа"], 6: ["Tauren", "Таурен"],
};
// name, level, class, race, faction, realm
const people = [
  ["Шпунтяра", 90, 5, 27, "HORDE"], ["Elkardia", 90, 1, 10, "HORDE"], ["Moonveil", 90, 11, 4, "ALLIANCE"], ["Brightmane", 88, 2, 1, "ALLIANCE"],
  ["Frostwhisper", 86, 8, 10, "HORDE"], ["Grimtusk", 80, 6, 2, "HORDE"], ["Sylvaran", 80, 12, 4, "ALLIANCE"], ["Ashtongue", 74, 9, 34, "ALLIANCE"],
  ["Thundrak", 70, 7, 6, "HORDE"], ["Kaelwyn", 62, 3, 11, "ALLIANCE"], ["Zul'jinna", 45, 4, 8, "HORDE"], ["Emberscale", 12, 13, 52, "HORDE"],
];
function fixture(locale, realms) {
  const i = locale === "ru" ? 1 : 0;
  return people.map(([name, level, classId, raceId, faction], index) => {
    const realm = realms[index % realms.length];
    return {
      id: index + 1, accountId: 1, region: realm.region, name, level,
      realm: { id: index + 1, name: realm.name[i], slug: realm.slug },
      playableClass: { id: classId, name: classes[classId][i] },
      playableRace: { id: raceId, name: races[raceId][i] },
      faction: { type: faction, name: faction === "HORDE" ? ["Horde", "Орда"][i] : ["Alliance", "Альянс"][i] },
      armoryUrl: `https://worldofwarcraft.blizzard.com/character/${realm.region}/${realm.slug}/${encodeURIComponent(name.toLowerCase())}`,
    };
  });
}
const oneRealm = [{ region: "eu", slug: "ashenvale", name: ["Ashenvale", "Ясеневый лес"] }];
const manyRealms = [...oneRealm, { region: "eu", slug: "silvermoon", name: ["Silvermoon", "Silvermoon"] }, { region: "us", slug: "area-52", name: ["Area 52", "Area 52"] }];

async function signedIn(context, locale, realms, delay = 0) {
  const value = await encode({ token: { name: "Fixture#1234", battleNetAccessToken: "fixture-only", battleNetExpiresAt: Math.floor(Date.now() / 1000) + 3600 }, secret: process.env.ROSTER_QA_SECRET, salt: "authjs.session-token" });
  await context.addCookies([{ name: "authjs.session-token", value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/api/wow/characters/roster?**", async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ regions: [{ region: "eu", status: 200, characters: fixture(locale, realms) }] }) });
  });
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const shots = [
  { name: "roster-en-1440", locale: "en", width: 1440, realms: oneRealm },
  { name: "roster-ru-390", locale: "ru", width: 390, realms: oneRealm },
  { name: "roster-realms-en-1440", locale: "en", width: 1440, realms: manyRealms },
  { name: "roster-realms-ru-390", locale: "ru", width: 390, realms: manyRealms },
  { name: "roster-loading-en-1440", locale: "en", width: 1440, realms: oneRealm, delay: 60_000, loading: true },
  { name: "guest-en-1440", locale: "en", width: 1440 },
  { name: "guest-ru-390", locale: "ru", width: 390 },
].filter(shot => !only || only.includes(shot.name));
const report = [];
try {
  for (const shot of shots) {
    const context = await browser.newContext({ viewport: { width: shot.width, height: 900 }, deviceScaleFactor: 1 });
    if (shot.realms) await signedIn(context, shot.locale, shot.realms, shot.delay);
    await context.addInitScript(() => {
      localStorage.setItem("gildra-consent", "declined");
      localStorage.setItem("gildra-home-music", JSON.stringify({ confirmed: true, enabled: false, volume: 0 }));
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${base}${shot.locale === "ru" ? "/ru" : ""}/wow/characters`, { waitUntil: "load" });
    if (shot.realms && !shot.loading) await page.locator("[data-character-card]").first().waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    // Bring every lazy portrait in, then return to the top for the shot.
    await page.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 400)); window.scrollTo(0, 0); });
    await page.waitForTimeout(900);
    const metrics = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-character-card]")];
      const box = cards[0]?.getBoundingClientRect();
      return {
        cards: cards.length,
        cardSize: box ? [Math.round(box.width), Math.round(box.height)] : null,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        main: document.querySelector("main")?.innerText.replace(/\s+\n/g, "\n").slice(0, 1600),
      };
    });
    await page.screenshot({ path: path.join(output, `${shot.name}.png`), fullPage: true });
    if (shot.realms && !shot.loading) {
      const card = page.locator("[data-character-card]").nth(1);
      await card.hover();
      await page.waitForTimeout(400);
      await card.screenshot({ path: path.join(output, `${shot.name}-hover.png`) });
    }
    report.push({ ...shot, delay: undefined, realms: shot.realms?.length, ...metrics, errors });
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
for (const entry of report) console.log(entry.name, JSON.stringify({ cards: entry.cards, cardSize: entry.cardSize, overflowX: entry.overflowX, errors: entry.errors }));
