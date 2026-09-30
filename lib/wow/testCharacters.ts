import { talentSpecThemes, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { furybarFixture, type CharacterAuditSnapshot } from "@/lib/wow/characterAudit";
import { buildTestGear, getModelItems, getPrimaryStatLabel } from "@/lib/wow/testCharacterEquipment";

type CharacterIdentity = { slug: string; name: string };

const identities: Record<string, CharacterIdentity> = {
  "balance-druid": { slug: "lunara", name: "Лунара" },
  "feral-druid": { slug: "kogtegriv", name: "Когтегрив" },
  "guardian-druid": { slug: "duboshkur", name: "Дубошкур" },
  "restoration-druid": { slug: "verdelis", name: "Верделис" },
  "devastation-evoker": { slug: "ignivar", name: "Игнивар" },
  "preservation-evoker": { slug: "khronara", name: "Хронара" },
  "augmentation-evoker": { slug: "zemlekryl", name: "Землекрыл" },
  "discipline-priest": { slug: "absolon", name: "Абсолон" },
  "holy-priest": { slug: "aurelia", name: "Аурелия" },
  "shadow-priest": { slug: "voidara", name: "Войдара" },
  "blood-death-knight": { slug: "krovogrob", name: "Кровогроб" },
  "frost-death-knight": { slug: "ledorez", name: "Ледорез" },
  "unholy-death-knight": { slug: "morokost", name: "Морокост" },
  "beast-mastery-hunter": { slug: "zverolov", name: "Зверолов" },
  "marksmanship-hunter": { slug: "metkoglaz", name: "Меткоглаз" },
  "survival-hunter": { slug: "kopelom", name: "Копьелом" },
  "assassination-rogue": { slug: "yadoten", name: "Ядотень" },
  "outlaw-rogue": { slug: "korsar", name: "Корсар" },
  "subtlety-rogue": { slug: "nocheshagh", name: "Ночешаг" },
  "elemental-shaman": { slug: "gromozov", name: "Громозов" },
  "enhancement-shaman": { slug: "volkoklyk", name: "Волкоклык" },
  "restoration-shaman": { slug: "priliv", name: "Прилив" },
  "holy-paladin": { slug: "solntsezhar", name: "Солнцежар" },
  "protection-paladin": { slug: "egidaar", name: "Эгидаар" },
  "retribution-paladin": { slug: "vozdatel", name: "Воздатель" },
  "arcane-mage": { slug: "arkanoks", name: "Арканокс" },
  "fire-mage": { slug: "pepelina", name: "Пепелина" },
  "frost-mage": { slug: "inevetra", name: "Иневетра" },
  "arms-warrior": { slug: "stalekrov", name: "Сталекров" },
  "fury-warrior": { slug: "furybar", name: "Фьюрибар" },
  "protection-warrior": { slug: "shchitolom", name: "Щитолом" },
  "affliction-warlock": { slug: "tlenopis", name: "Тленопис" },
  "demonology-warlock": { slug: "demonarkh", name: "Демонарх" },
  "destruction-warlock": { slug: "khaoszhar", name: "Хаосжар" },
  "brewmaster-monk": { slug: "khmelekam", name: "Хмелекам" },
  "windwalker-monk": { slug: "vetroshag", name: "Ветрошаг" },
  "mistweaver-monk": { slug: "tumaneya", name: "Туманея" },
  "havoc-demon-hunter": { slug: "skvernorez", name: "Сквернорез" },
  "vengeance-demon-hunter": { slug: "pechatnik", name: "Печатник" },
  "devourer-demon-hunter": { slug: "bezdnoglot", name: "Бездноглот" },
};

const raceByClass: Record<string, string> = {
  druid: "Таурен",
  evoker: "Драктир",
  priest: "Отрекшийся",
  deathknight: "Орк",
  hunter: "Тролль",
  rogue: "Гоблин",
  shaman: "Орк",
  paladin: "Эльф крови",
  mage: "Ночнорождённый",
  warrior: "Орк",
  warlock: "Отрекшийся",
  monk: "Пандарен",
  demonhunter: "Эльф крови",
};

const modelByClass: Record<string, { race: string; modelId: number }> = {
  druid: { race: "tauren", modelId: 11 },
  evoker: { race: "blood-elf-visage", modelId: 19 },
  priest: { race: "undead", modelId: 9 },
  deathknight: { race: "orc", modelId: 3 },
  hunter: { race: "troll", modelId: 15 },
  rogue: { race: "goblin", modelId: 21 },
  shaman: { race: "orc", modelId: 3 },
  paladin: { race: "blood-elf", modelId: 19 },
  mage: { race: "blood-elf", modelId: 19 },
  warrior: { race: "orc", modelId: 3 },
  warlock: { race: "undead", modelId: 9 },
  monk: { race: "pandaren", modelId: 25 },
  demonhunter: { race: "blood-elf", modelId: 19 },
};

function makeFixture(theme: TalentSpecTheme, index: number): CharacterAuditSnapshot {
  if (theme.slug === "fury-warrior") return furybarFixture;
  const identity = identities[theme.slug] ?? { slug: `test-${theme.slug}`, name: theme.specNameRu };
  const gear = buildTestGear(theme, index, furybarFixture.gear);
  const itemLevel = Math.round(gear.reduce((sum, item) => sum + item.itemLevel, 0) / gear.length);
  const overall = 76 + (index * 7) % 17;
  return {
    slug: identity.slug,
    character: {
      name: identity.name,
      className: `${theme.classNameRu} · ${theme.specNameRu}`,
      race: raceByClass[theme.classKey] ?? "Орк",
      level: 80,
      faction: "Орда",
      itemLevel,
      mythicRating: theme.role === "tank" || theme.role === "healer" ? 2140 + index * 17 : 1870 + index * 19,
    },
    specialization: {
      slug: theme.slug,
      classKey: theme.classKey,
      className: theme.classNameRu,
      specName: theme.specNameRu,
      role: theme.role,
      roleLabel: theme.roleRu,
      primaryStatLabel: getPrimaryStatLabel(theme),
      accent: theme.accent,
      resourceLabel: theme.resourceLabel,
      fantasy: theme.fantasy,
      iconUrl: theme.iconUrl,
    },
    scores: {
      overall,
      talents: Math.min(98, overall + 4 + index % 5),
      gear: Math.min(96, overall + index % 4),
      enchants: Math.max(68, overall - 7 + index % 6),
      gems: Math.max(72, overall - 3 + index % 8),
    },
    appearance: {
      ...furybarFixture.appearance,
      presetId: `${identity.slug}-prototype-v1`,
      race: modelByClass[theme.classKey]?.race ?? "orc",
      modelId: modelByClass[theme.classKey]?.modelId ?? 3,
      modelItems: getModelItems(theme),
      skinTone: theme.deep,
      eyeGlow: theme.hot,
      armor: {
        setName: `Комплект специализации «${theme.specNameRu}»`,
        primary: theme.deep,
        secondary: theme.accent,
        accent: theme.hot,
        glow: theme.accent,
      },
      weapons: {
        mainHand: { ...furybarFixture.appearance.weapons.mainHand, itemName: gear.find((item) => item.slot === "Основная рука")?.name ?? "Основное оружие" },
        offHand: { ...furybarFixture.appearance.weapons.offHand, itemName: gear.find((item) => item.slot === "Левая рука")?.name ?? "Дополнительное оружие" },
      },
    },
    source: "fixture",
    updatedAt: "тестовые данные · сейчас",
    gear,
  };
}

export const testCharacters = talentSpecThemes.map(makeFixture);

export const testCharacterClasses = Array.from(new Set(testCharacters.map((entry) => entry.specialization.classKey))).map((classKey) => ({
  classKey,
  className: testCharacters.find((entry) => entry.specialization.classKey === classKey)!.specialization.className,
  characters: testCharacters.filter((entry) => entry.specialization.classKey === classKey),
}));

export function getTestCharacter(slug: string) {
  return testCharacters.find((entry) => entry.slug === slug);
}

export function getTestCharacterBySpec(specSlug: string) {
  return testCharacters.find((entry) => entry.specialization.slug === specSlug);
}
