import { chromium } from "playwright";
import process from "node:process";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function inspect(route) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  assert(response?.status() === 200, `${route}: expected HTTP 200, got ${response?.status()}`);
  await page.locator("main").first().waitFor({ state: "attached", timeout: 5_000 });
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => ({
    h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
    text: document.querySelector("main")?.textContent ?? "",
    images: document.querySelectorAll("main img").length,
    tierRows: document.querySelectorAll("main table.tt tbody tr").length,
    characterLinks: document.querySelectorAll('main a[href*="/wow/characters/"]').length,
    furybarLinks: document.querySelectorAll('main a[href$="/wow/demo/furybar"]').length,
    raidLinks: document.querySelectorAll('main a[href*="/wow/raids/"]').length,
    mythicLinks: document.querySelectorAll('main a[href*="/wow/mythic/"]').length,
    lairLinks: document.querySelectorAll('main a[href*="/wow/lairs/"]').length,
    mechanicRows: document.querySelectorAll("main .ability-row").length,
    positioningCards: document.querySelectorAll("main .position-grid article").length,
    lootRows: document.querySelectorAll("main .loot-table-wrap tbody tr").length,
    hasCyrillic: /[А-Яа-яЁё]/.test(document.querySelector("main")?.textContent ?? ""),
    waypointLabels: [...document.querySelectorAll("main .wow-waypoint")].map((button) => button.getAttribute("aria-label") ?? ""),
    raidCoverageCards: document.querySelectorAll('[data-testid="raid-data-coverage"] dl > div').length,
    raidLootBands: document.querySelectorAll('[data-testid="raid-loot-bands"] tbody tr').length,
    gloryRequirements: document.querySelectorAll('[data-testid="raid-glory-requirements"] > li').length,
    encounterLootBands: document.querySelectorAll('[data-testid="encounter-loot-band"] tbody tr').length,
    sporefallCards: document.querySelectorAll('[data-testid="sporefall-identity-card"]').length,
    tacticalBoards: document.querySelectorAll('[data-testid="raid-tactical-board"]').length,
    voidspireActionCards: document.querySelectorAll('[data-testid="voidspire-action-card"]').length,
    fixedSquadMembers: document.querySelectorAll('[data-testid="raid-tactical-board"] button[aria-pressed]').length,
  }));
  await page.close();
  return result;
}

async function inspectWaypoint(route) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  const button = page.locator("main .wow-waypoint");
  await button.click();
  await page.waitForTimeout(100);
  const result = { text: (await button.locator("span").innerText()).trim(), errors };
  await page.close();
  return result;
}

try {
  const home = await inspect("/wow");
  assert(home.h1 === "Your command center in Azeroth", `/wow: restored heading missing (${home.h1})`);
  assert(home.images >= 5, `/wow: expected restored artwork, got ${home.images} loaded images`);
  assert(home.furybarLinks >= 2, `/wow: Furybar shortcuts are missing`);

  const platformHome = await inspect("/");
  assert(platformHome.text.includes("Fury Warrior"), `/: fixed WoW character card is missing`);
  assert(platformHome.images >= 8, `/: expected restored platform artwork, got ${platformHome.images} loaded images`);

  const homeRu = await inspect("/ru/wow");
  assert(homeRu.h1 === "Ваш командный центр в Азероте", `/ru/wow: restored heading missing (${homeRu.h1})`);
  assert(homeRu.images >= 5, `/ru/wow: expected restored artwork, got ${homeRu.images} loaded images`);

  const roster = await inspect("/wow/characters");
  assert(roster.h1 === "Персонажи аккаунта", `/wow/characters: roster heading missing (${roster.h1})`);
  assert(roster.characterLinks >= 30, `/wow/characters: fixed roster is incomplete (${roster.characterLinks} links)`);
  assert(roster.furybarLinks >= 1, `/wow/characters: Furybar is missing`);
  assert(roster.text.includes("Фиксированные данные"), `/wow/characters: fixture label is missing`);

  const furybar = await inspect("/wow/demo/furybar");
  assert(furybar.h1 === "Фьюрибар", `/wow/demo/furybar: profile heading missing (${furybar.h1})`);
  assert(furybar.images >= 5, `/wow/demo/furybar: character artwork or item icons are missing (${furybar.images})`);

  const raids = await inspect("/wow/raids");
  assert(raids.h1 === "Raid journal", `/wow/raids: visual atlas heading missing (${raids.h1})`);
  assert(raids.images >= 10, `/wow/raids: raid artwork is missing (${raids.images})`);
  assert(raids.raidLinks >= 10, `/wow/raids: raid and boss links are missing (${raids.raidLinks})`);
  assert(raids.text.includes("18") && raids.text.includes("Rotmire"), `/wow/raids: 18-boss Midnight inventory or Rotmire is missing`);
  assert(raids.sporefallCards === 1, `/wow/raids: Sporefall identity card is missing`);

  const venomousRaid = await inspect("/wow/raids/venomous-abyss");
  assert(venomousRaid.raidCoverageCards === 4, `/wow/raids/venomous-abyss: data coverage summary is incomplete`);
  assert(venomousRaid.raidLootBands === 4, `/wow/raids/venomous-abyss: loot-level bands are incomplete`);
  assert(venomousRaid.gloryRequirements === 8, `/wow/raids/venomous-abyss: Glory requirements are incomplete`);
  assert(venomousRaid.text.includes("47.11 28.30") && venomousRaid.text.includes("47.2 21.7"), `/wow/raids/venomous-abyss: attributed coordinate conflict is missing`);
  assert(venomousRaid.text.includes("37") && venomousRaid.text.includes("12") && venomousRaid.text.includes("11"), `/wow/raids/venomous-abyss: verified coverage counts are missing`);
  assert(!venomousRaid.hasCyrillic, `/wow/raids/venomous-abyss: English journal contains Russian copy`);

  const venomousBoss = await inspect("/wow/raids/venomous-abyss/ulatek");
  assert(venomousBoss.encounterLootBands === 4, `/wow/raids/venomous-abyss/ulatek: encounter reward bands are incomplete`);
  assert(venomousBoss.text.includes("344") && venomousBoss.text.includes("Slumbering Coil Curio"), `/wow/raids/venomous-abyss/ulatek: apex reward band or tier reward is missing`);
  assert(["Mechanics by role", "Timeline", "Positioning", "Composition"].every((label) => venomousBoss.text.includes(label)), `/wow/raids/venomous-abyss/ulatek: source-tracked strategy workspace is incomplete`);
  assert(venomousBoss.text.includes("The exact drop chance has not been published"), `/wow/raids/venomous-abyss/ulatek: honest drop-chance status is missing`);
  assert(!venomousBoss.hasCyrillic, `/wow/raids/venomous-abyss/ulatek: English guide contains Russian copy`);

  const voidspireBosses = [
    ["imperator-averzian", "Imperator Averzian", "Император Аверзиан", 7],
    ["vorasius", "Vorasius", "Ненасытникус", 5],
    ["fallen-king-salhadaar", "Fallen-King Salhadaar", "Павший король Салхадаар", 6],
    ["vaelgor-ezzorak", "Vaelgor & Ezzorak", "Ваэлгор и Эззорак", 6],
    ["lightblinded-vanguard", "Lightblinded Vanguard", "Ослепленный авангард", 8],
    ["crown-of-the-cosmos", "Crown of the Cosmos", "Корона космоса", 9],
  ];
  for (const [slug, nameEn, nameRu, expectedActions] of voidspireBosses) {
    const boss = await inspect(`/wow/raids/the-voidspire/${slug}`);
    assert(boss.text.includes(nameEn), `/wow/raids/the-voidspire/${slug}: boss content is missing`);
    assert(boss.tacticalBoards === 1, `/wow/raids/the-voidspire/${slug}: tactical map is missing`);
    assert(boss.voidspireActionCards === expectedActions, `/wow/raids/the-voidspire/${slug}: expected ${expectedActions} sourced actions, got ${boss.voidspireActionCards}`);
    assert(boss.fixedSquadMembers >= 7, `/wow/raids/the-voidspire/${slug}: fixed example squad controls are missing`);
    assert(!boss.hasCyrillic, `/wow/raids/the-voidspire/${slug}: English guide contains Russian copy`);
    assert(boss.text.includes("Spell ID withheld pending verification"), `/wow/raids/the-voidspire/${slug}: honest spell-ID status is missing`);

    const bossRu = await inspect(`/ru/wow/raids/the-voidspire/${slug}`);
    assert(bossRu.text.includes(nameRu), `/ru/wow/raids/the-voidspire/${slug}: localized boss content is missing`);
    assert(bossRu.tacticalBoards === 1 && bossRu.voidspireActionCards === expectedActions, `/ru/wow/raids/the-voidspire/${slug}: localized tactical coverage is incomplete`);
    assert(bossRu.hasCyrillic, `/ru/wow/raids/the-voidspire/${slug}: Russian guide lost localized copy`);
  }

  const raidsRu = await inspect("/ru/wow/raids");
  assert(raidsRu.h1 === "Рейдовый журнал", `/ru/wow/raids: visual atlas heading missing (${raidsRu.h1})`);
  assert(raidsRu.images >= 10, `/ru/wow/raids: raid artwork is missing (${raidsRu.images})`);
  assert(raidsRu.text.includes("Rotmire") && raidsRu.sporefallCards === 1, `/ru/wow/raids: Sporefall/Rotmire identity is missing`);

  const venomousRaidRu = await inspect("/ru/wow/raids/venomous-abyss");
  assert(venomousRaidRu.hasCyrillic, `/ru/wow/raids/venomous-abyss: Russian journal lost localized copy`);
  assert(venomousRaidRu.raidLootBands === 4 && venomousRaidRu.gloryRequirements === 8, `/ru/wow/raids/venomous-abyss: localized rewards coverage is incomplete`);

  const mythic = await inspect("/wow/mythic-plus");
  assert(mythic.h1 === "Mythic+ atlas", `/wow/mythic-plus: visual atlas heading missing (${mythic.h1})`);
  assert(mythic.images >= 8, `/wow/mythic-plus: dungeon artwork is missing (${mythic.images})`);
  assert(mythic.mythicLinks >= 8, `/wow/mythic-plus: dungeon route links are missing (${mythic.mythicLinks})`);

  const dungeon = await inspect("/wow/mythic/ruby-life-pools");
  assert(dungeon.text.includes("Ruby Life Pools"), `/wow/mythic/ruby-life-pools: route content is missing`);
  assert(dungeon.images >= 5, `/wow/mythic/ruby-life-pools: route artwork is missing (${dungeon.images})`);

  const lairs = await inspect("/wow/lairs");
  assert(lairs.h1 === "Lairs and world bosses", `/wow/lairs: visual journal heading missing (${lairs.h1})`);
  assert(lairs.images >= 10, `/wow/lairs: Lair and world-boss artwork is missing (${lairs.images})`);
  assert(lairs.lairLinks >= 5, `/wow/lairs: Lair and world-boss links are missing (${lairs.lairLinks})`);

  const lair = await inspect("/wow/lairs/nymrissa-wavecaller");
  assert(lair.h1 === "Nymrissa Wavecaller", `/wow/lairs/nymrissa-wavecaller: boss heading missing (${lair.h1})`);
  assert(lair.images >= 20, `/wow/lairs/nymrissa-wavecaller: boss, ability, or loot artwork is missing (${lair.images})`);
  assert(lair.mechanicRows >= 9, `/wow/lairs/nymrissa-wavecaller: sourced mechanics are missing (${lair.mechanicRows})`);
  assert(lair.positioningCards >= 3, `/wow/lairs/nymrissa-wavecaller: positioning guidance is missing (${lair.positioningCards})`);
  assert(lair.lootRows >= 12, `/wow/lairs/nymrissa-wavecaller: loot table is incomplete (${lair.lootRows})`);
  assert(lair.text.includes("Bubblefin Frostscale") && lair.text.includes("Water Jet"), `/wow/lairs/nymrissa-wavecaller: Mythic mob mechanics are missing`);
  assert(lair.text.includes("The exact drop chance has not been published"), `/wow/lairs/nymrissa-wavecaller: honest drop-chance status is missing`);
  assert(!lair.hasCyrillic, `/wow/lairs/nymrissa-wavecaller: English guide contains Russian copy`);
  assert(lair.waypointLabels.includes("Copy coordinates"), `/wow/lairs/nymrissa-wavecaller: waypoint button is not localized`);
  const waypointEn = await inspectWaypoint("/wow/lairs/nymrissa-wavecaller");
  assert(waypointEn.text === "Copied" && waypointEn.errors.length === 0, `/wow/lairs/nymrissa-wavecaller: waypoint copy failed (${waypointEn.text})`);

  for (const slug of ["luashal", "cragpine", "thormbelan", "predaxas"]) {
    const guide = await inspect(`/wow/lairs/${slug}`);
    assert(guide.mechanicRows >= 3, `/wow/lairs/${slug}: mechanic reactions are missing (${guide.mechanicRows})`);
    assert(guide.positioningCards >= 3, `/wow/lairs/${slug}: positioning guidance is missing (${guide.positioningCards})`);
    assert(guide.lootRows >= 8, `/wow/lairs/${slug}: loot rows are missing (${guide.lootRows})`);
    assert(guide.text.includes("Spell ID") && guide.text.includes("The exact drop chance has not been published"), `/wow/lairs/${slug}: source IDs or chance status are missing`);
    assert(!guide.hasCyrillic, `/wow/lairs/${slug}: English guide contains Russian copy`);
    assert(guide.waypointLabels.includes("Copy coordinates"), `/wow/lairs/${slug}: waypoint button is not localized`);
  }

  const lairsRu = await inspect("/ru/wow/lairs");
  assert(lairsRu.h1 === "Логова и мировые боссы", `/ru/wow/lairs: visual journal heading missing (${lairsRu.h1})`);
  assert(lairsRu.images >= 10, `/ru/wow/lairs: Lair and world-boss artwork is missing (${lairsRu.images})`);
  assert(lairsRu.lairLinks >= 5, `/ru/wow/lairs: Lair and world-boss links are missing (${lairsRu.lairLinks})`);

  const lairRu = await inspect("/ru/wow/lairs/nymrissa-wavecaller");
  assert(lairRu.hasCyrillic, `/ru/wow/lairs/nymrissa-wavecaller: Russian guide lost localized copy`);
  assert(lairRu.text.includes("Точный шанс выпадения не опубликован"), `/ru/wow/lairs/nymrissa-wavecaller: Russian chance status is missing`);
  assert(lairRu.waypointLabels.includes("Скопировать координаты"), `/ru/wow/lairs/nymrissa-wavecaller: waypoint button is not localized`);
  const waypointRu = await inspectWaypoint("/ru/wow/lairs/nymrissa-wavecaller");
  assert(waypointRu.text === "Скопировано" && waypointRu.errors.length === 0, `/ru/wow/lairs/nymrissa-wavecaller: waypoint copy failed (${waypointRu.text})`);

  const tiers = await inspect("/tier-lists");
  assert(tiers.tierRows >= 10, `/tier-lists: fixed tier rows are missing (${tiers.tierRows})`);
  assert(tiers.text.includes("Fixed interface data"), `/tier-lists: fixed-data label is missing`);

  process.stdout.write("qa:wow-ui-preservation PASS — home, fixed characters, raid journal coverage/rewards, Mythic/Lairs artwork, and tier rows restored\n");
} finally {
  await browser.close();
}
