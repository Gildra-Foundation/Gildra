type Localized = { ru: string; en: string };

export type RaidProgression = {
  links: { from: string; to: string }[];
  note: Localized;
  lieutenants: {
    npcId: number;
    name: Localized;
    note: Localized;
    beforeBoss?: string;
    afterBoss?: string;
  }[];
  sources: { title: string; url: string }[];
};

const text = (ru: string, en: string): Localized => ({ ru, en });
const lieutenantSource = {
  title: "Wowhead — Midnight Season 1 raid lieutenants (17 Apr 2026)",
  url: "https://www.wowhead.com/news/all-lieutenant-enemies-that-drop-boes-in-midnight-season-1-raids-381260",
};
const seasonOneSource = {
  title: "Blizzard — Midnight Season 1 raids",
  url: "https://news.blizzard.com/en-us/article/24264416/march-on-quel-danas-raid-finder-and-story-mode-now-live",
};

// Links express encounter progression, not a walkable path or map coordinates.
// At a branch join, every incoming branch must be cleared; the notes make this
// requirement explicit rather than presenting the join as a choice of gates.
function links(first: string, branches: string[][], then: string[]): RaidProgression["links"] {
  const result: RaidProgression["links"] = [];
  const connect = (route: string[]) => {
    for (let index = 1; index < route.length; index++) result.push({ from: route[index - 1], to: route[index] });
  };
  if (!branches.length) connect([first, ...then]);
  else {
    for (const branch of branches) {
      connect([first, ...branch]);
      if (then.length) result.push({ from: branch[branch.length - 1], to: then[0] });
    }
    connect(then);
  }
  return result;
}

const progression: Record<string, RaidProgression> = {
  "the-voidspire": {
    links: links("imperator-averzian", [["vorasius"], ["fallen-king-salhadaar"]], ["vaelgor-ezzorak", "lightblinded-vanguard", "crown-of-the-cosmos"]),
    note: text(
      "После Аверзиана зачистите оба крыла в любом порядке: Ненасытникус слева, Салхадаар справа. Затем продолжайте к драконам, Авангарду и Короне космоса.",
      "After Averzian, clear both wings in either order: Vorasius on the left and Salhadaar on the right. Then continue to the dragons, Vanguard and Crown of the Cosmos.",
    ),
    lieutenants: [
      { npcId: 240864, name: text("Блинки", "Blinky"), beforeBoss: "vorasius", afterBoss: "imperator-averzian", note: text("Патруль у лестницы левого крыла.", "Patrol by the left-wing stairs.") },
      { npcId: 240831, name: text("Мракозария Вечный Рассвет", "Voidlight Everdawn"), beforeBoss: "vorasius", afterBoss: "imperator-averzian", note: text("На площадке Ненасытникуса.", "On Vorasius's platform.") },
      { npcId: 252067, name: text("Страж террасы", "Terrace Watcher"), beforeBoss: "fallen-king-salhadaar", afterBoss: "imperator-averzian", note: text("Верх лестницы правого крыла.", "At the top of the right-wing stairs.") },
      { npcId: 252066, name: text("Гладий Слаурос", "Gladius Slauros"), afterBoss: "imperator-averzian", beforeBoss: "vaelgor-ezzorak", note: text("Центральная лестница. На героической и эпохальной сложности сначала убейте Ненасытникуса и Павшего короля Салхадаара: «Сила в тенях» отражает урон.", "Central stairs. On Heroic and Mythic, defeat Vorasius and Fallen-King Salhadaar first: Strength in Shadows reflects damage.") },
      { npcId: 256598, name: text("Небесный исполин", "Celestial Behemoth"), afterBoss: "vaelgor-ezzorak", beforeBoss: "lightblinded-vanguard", note: text("Патруль кольца после драконов.", "Ring patrol after the dragons.") },
    ],
    sources: [seasonOneSource, lieutenantSource, { title: "Wowhead — The Voidspire overview (4 Jun 2026)", url: "https://www.wowhead.com/guide/midnight/raids/the-voidspire-overview-location-rewards-bosses" }],
  },
  "march-on-queldanas": {
    links: links("beloren", [], ["midnight-falls"]),
    note: text("Сначала Бело’рен, затем Торжество Полуночи через Тёмный Колодец.", "Defeat Belo'ren, then continue through the Darkwell to Midnight Falls."),
    lieutenants: [
      { npcId: 250802, name: text("Разрушитель Бездны Троггар", "Voidbreaker Throggar"), beforeBoss: "beloren", note: text("Двор перед Бело’реном; убийство босса для доступа не требуется.", "Courtyard before Belo'ren; no boss kill is required to reach him.") },
      { npcId: 250803, name: text("Гладий Моринас", "Gladius Morinas"), afterBoss: "beloren", beforeBoss: "midnight-falls", note: text("Охраняет вход в Тёмный Колодец после Бело’рена.", "Guards the Darkwell entrance after Belo'ren.") },
    ],
    sources: [seasonOneSource, lieutenantSource, { title: "Wowhead — March on Quel'Danas overview (8 Jun 2026)", url: "https://www.wowhead.com/guide/midnight/raids/march-on-quel-danas-overview-location-rewards-bosses" }],
  },
  "the-dreamrift": {
    links: [],
    note: text("В рейде один босс — Химерий. Карта арены относится к этому бою; прислужники и смена миров — его механики.", "Chimaerus is the raid's only boss. The arena map belongs to this encounter; adds and realm changes are encounter mechanics."),
    lieutenants: [],
    sources: [seasonOneSource, { title: "Wowhead — The Dreamrift overview (8 Jun 2026)", url: "https://www.wowhead.com/guide/midnight/raids/the-dreamrift-overview-location-rewards-boss" }],
  },
  "venomous-abyss": {
    links: links("nekzali-the-soulcoiler", [["entombed-sentinels", "vashnik-the-malignant"], ["the-lost-explorers", "sszorak"]], ["the-twin-fangs", "the-coiled-altar", "ulatek"]),
    note: text(
      "После Нек’зали пройдите обе ветви в любом порядке: Стражи → Вашник и Исследователи → Ссзорак. Только после обеих ветвей возвращайтесь к Двум Клыкам, затем к Спиральному алтарю и Ула’тек. Порядок крыльев поиска рейда отличается.",
      "After Nek'zali, clear both wings in either order: Sentinels → Vashnik and Explorers → Sszorak. Only after both wings, return to Twin Fangs, then continue to the Coiled Altar and Ula'tek. Raid Finder wing order differs.",
    ),
    lieutenants: [],
    sources: [
      { title: "Blizzard — The Venomous Abyss raid", url: "https://news.blizzard.com/en-us/article/24294062/curse-of-ulatek-the-venomous-abyss-raid-finder-wing-3-now-live" },
      { title: "Wowhead — The Venomous Abyss overview (27 Aug 2026)", url: "https://www.wowhead.com/guide/midnight/raids/the-venomous-abyss-overview-location-rewards-bosses" },
    ],
  },
  sporefall: {
    links: [],
    note: text("В рейде один босс — Гнилотоп. Прислужники появляются во время боя; их расположение не задаёт маршрут зачистки между боссами.", "Rotmire is the raid's only boss. Adds spawn during combat; their positions do not form an inter-boss trash route."),
    lieutenants: [],
    sources: [{ title: "Blizzard — Prepare to Face Rotmire in the Sporefall Raid", url: "https://news.blizzard.com/en-us/article/24272110/prepare-to-face-rotmire-in-the-sporefall-raid" }],
  },
};

export function getRaidProgression(slug: string): RaidProgression | undefined {
  return Object.hasOwn(progression, slug) ? progression[slug] : undefined;
}
