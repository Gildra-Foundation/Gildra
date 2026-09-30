import type { PvPTalent, TalentNode } from "@/lib/talentCalculatorData";

export type TalentVisualTheme = "blood" | "steel" | "fury" | "fire" | "storm" | "charge" | "guard" | "warcry" | "frost" | "nature" | "shadow" | "holy" | "arcane" | "poison" | "fel" | "water";
export type TalentVisualAsset = "blood-drop" | "twin-blades" | "whirlwind" | "execution" | "spear" | "flame" | "lightning" | "shield" | "warcry" | "charge" | "rage-claw" | "war-banner";

const THEME_RULES: Array<{ theme: TalentVisualTheme; pattern: RegExp }> = [
  { theme: "blood", pattern: /blood|bleed|thirst|wound|hemorr|vampir|leech|rend|gushing|кров|кровотеч/i },
  { theme: "frost", pattern: /frost|ice|rime|winter|glacial|frozen|chill|remorseless|pillar of frost|лед|мороз|иней|зим/i },
  { theme: "fel", pattern: /fel|demon|chaos|infernal|immolation|metamorph|скверн|демон|хаос/i },
  { theme: "poison", pattern: /poison|venom|toxic|plague|disease|rot|decay|blight|virulent|яд|чум|болез|гнил/i },
  { theme: "shadow", pattern: /shadow|void|dark|night|insanity|apparition|vampiric|тен|бездн|тьм|безуми/i },
  { theme: "holy", pattern: /holy|light|divine|radiance|angel|beacon|crusad|templar|свет|свящ|божеств/i },
  { theme: "arcane", pattern: /arcane|mana|spell|time|temporal|chron|тайн|ман|времен|заклин/i },
  { theme: "water", pattern: /water|tide|wave|rain|mist|riptide|stream|вод|прилив|волн|дожд|туман/i },
  { theme: "nature", pattern: /nature|wild|leaf|grove|bloom|verdant|rejuven|beast|primal|природ|дик|рощ|цвет|звер/i },
  { theme: "fire", pattern: /odyn|fire|flame|burn|blaze|ashen|magma|ignite|immolat|огн|плам|жар/i },
  { theme: "storm", pattern: /thunder|storm|lightning|bolt|crackling|shock|гром|бур|молн/i },
  { theme: "charge", pattern: /charge|leap|rush|stride|pursuit|bounding|intervene|mobility|рыв|прыж|скач/i },
  { theme: "warcry", pattern: /shout|roar|voice|cry|howl|rally|commanding|крик|рёв|голос/i },
  { theme: "guard", pattern: /shield|guard|safeguard|block|armor|defen|stamina|fortif|endurance|pain|parry|stance|защит|охран|брон|стойк/i },
  { theme: "steel", pattern: /blade|sword|weapon|strike|execute|slash|cleave|slam|onslaught|rampage|whirlwind|hack|steel|клин|меч|оруж|удар|казн/i },
  { theme: "fury", pattern: /fury|rage|enrage|berserk|reckless|avatar|juggernaut|ravager|torment|slayer|frenzy|ярост|неистов|берсерк/i },
];

const FALLBACK_THEMES: TalentVisualTheme[] = ["steel", "fury", "guard", "charge", "warcry", "fire"];

const ASSET_RULES: Array<{ asset: TalentVisualAsset; pattern: RegExp }> = [
  { asset: "whirlwind", pattern: /whirl|bladestorm|cyclone|ravager|cleave|вихр|буря клин/i },
  { asset: "execution", pattern: /execute|massacre|slaughter|sudden death|imminent demise|death drive|казн|смерт|скотобой/i },
  { asset: "spear", pattern: /spear|throw|javelin|bolt|champion|копь|брос|дрот/i },
  { asset: "blood-drop", pattern: /blood|bleed|thirst|wound|hemorr|leech|rend|кров|кровотеч/i },
  { asset: "lightning", pattern: /thunder|storm|lightning|shock|crackling|гром|молн/i },
  { asset: "flame", pattern: /odyn|fire|flame|burn|blaze|ashen|ignite|огн|плам|жар/i },
  { asset: "shield", pattern: /shield|guard|safeguard|block|armor|defen|parry|fortif|stance|защит|охран|щит|брон/i },
  { asset: "warcry", pattern: /shout|roar|voice|cry|howl|rally|commanding|крик|рёв|голос/i },
  { asset: "charge", pattern: /charge|leap|rush|stride|pursuit|intervene|mobility|рыв|прыж|скач/i },
  { asset: "war-banner", pattern: /banner|battlefield|war machine|victory|champion|знам|побед/i },
  { asset: "twin-blades", pattern: /blade|sword|weapon|strike|slam|onslaught|rampage|hack|disarm|клин|меч|оруж|удар|обезоруж/i },
  { asset: "rage-claw", pattern: /fury|rage|enrage|berserk|reckless|avatar|juggernaut|slayer|frenzy|ярост|неистов|берсерк/i },
];

const ASSET_MARKS: Record<TalentVisualAsset, string> = {
  "blood-drop": "M32 13C27 22 20 29 20 38a12 12 0 0 0 24 0c0-9-7-16-12-25Zm-6 26c1 4 4 6 8 7",
  "twin-blades": "M18 15l27 30M46 15 19 45M17 18l5-3-2 6M47 18l-5-3 2 6",
  whirlwind: "M17 25c8-9 26-8 31 3 4 10-8 20-19 18-9-1-15-9-10-16 4-6 14-5 16 1",
  execution: "M20 16l26 28M44 15 18 42M17 19l7-4-3 7M47 42l-3 7-5-6",
  spear: "M16 46 46 16M35 16h11v11M15 42l7 7M20 37l7 7",
  flame: "M34 13c3 9-5 12-2 19 2-4 7-6 9-12 5 7 7 13 5 20-2 7-8 11-14 11-8 0-14-6-14-14 0-7 4-12 10-18-1 7 3 10 6 12-2-7 6-10 10-19Z",
  lightning: "M37 12 20 35h12l-5 18 18-26H34l3-15Z",
  shield: "M32 13c7 5 12 6 17 7v13c0 10-7 16-17 20-10-4-17-10-17-20V20c5-1 10-2 17-7Zm0 8v24",
  warcry: "M18 26c7-8 21-8 28 0M14 20c10-12 26-12 36 0M22 33c5-5 15-5 20 0M27 40h10",
  charge: "M14 20h18l-7-7M32 20l-7 7M25 37h25l-8-8M50 37l-8 8M14 30h13",
  "rage-claw": "M17 17c7 8 7 17 2 27M27 13c7 10 6 22 0 36M39 14c5 10 4 21-2 34M49 18c3 8 2 17-3 25",
  "war-banner": "M21 52V14m1 3c9-5 16 7 25 1v20c-9 6-16-6-25-1M16 52h16",
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sigilPath(hash: number) {
  const points = 5 + (hash % 5);
  const innerRadius = 22 + ((hash >>> 4) % 4);
  const outerRadius = 29 + ((hash >>> 7) % 2);
  const offset = ((hash >>> 9) % 360) * Math.PI / 180;
  const coordinates = Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = offset - Math.PI / 2 + (Math.PI * index) / points;
    return `${(32 + Math.cos(angle) * radius).toFixed(1)} ${(32 + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return `M${coordinates.join("L")}Z`;
}

function visualSignature(key: string, searchable: string, assetSuffix: string) {
  const hash = stableHash(key);
  const theme = THEME_RULES.find((rule) => rule.pattern.test(searchable))?.theme ?? FALLBACK_THEMES[hash % FALLBACK_THEMES.length];
  const asset = ASSET_RULES.find((rule) => rule.pattern.test(searchable))?.asset ?? ({ blood: "blood-drop", steel: "twin-blades", fury: "rage-claw", fire: "flame", storm: "lightning", charge: "charge", guard: "shield", warcry: "warcry", frost: "lightning", nature: "war-banner", shadow: "rage-claw", holy: "shield", arcane: "whirlwind", poison: "blood-drop", fel: "flame", water: "whirlwind" } satisfies Record<TalentVisualTheme, TalentVisualAsset>)[theme];

  return {
    theme,
    asset,
    assetId: `${asset}-${assetSuffix}`,
    assetMark: ASSET_MARKS[asset],
    sigilPath: sigilPath(hash),
    sigilDash: `${2 + (hash % 6)} ${3 + ((hash >>> 5) % 7)}`,
    sigilRotation: hash % 360,
    phaseMs: -1 * (hash % 2600),
    durationMs: 2200 + (hash % 1900),
    angleDeg: (hash % 31) - 15,
  };
}

type TalentVisual = ReturnType<typeof visualSignature>;
const talentVisualCache = new WeakMap<TalentNode, Map<number | undefined, TalentVisual>>();

export function talentVisualTheme(node: TalentNode, selectedChoiceId?: number) {
  const cached = talentVisualCache.get(node)?.get(selectedChoiceId);
  if (cached) return cached;

  const selected = node.choices.find((choice) => choice.externalId === selectedChoiceId);
  const choices = selected ? [selected, ...node.choices.filter((choice) => choice !== selected)] : node.choices;
  const searchable = choices.map((choice) => `${choice.name} ${choice.description} ${choice.iconName ?? ""}`).join(" ");
  const visual = visualSignature(`${node.id}:${selectedChoiceId ?? "default"}`, searchable, `${node.id}-${selectedChoiceId ?? "base"}`);
  let choicesCache = talentVisualCache.get(node);
  if (!choicesCache) {
    choicesCache = new Map();
    talentVisualCache.set(node, choicesCache);
  }
  choicesCache.set(selectedChoiceId, visual);
  return visual;
}

export function pvpVisualTheme(talent: PvPTalent) {
  const searchable = `${talent.name} ${talent.description} ${talent.iconName ?? ""}`;
  return visualSignature(`pvp:${talent.externalId}`, searchable, `pvp-${talent.externalId}`);
}
