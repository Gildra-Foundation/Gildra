export type CombatLocaleText = { ru: string; en: string };
export type ReviewedAbility = {
  spellId: number;
  name: CombatLocaleText;
  action: "interrupt" | "stop" | "dispel" | "purge" | "focus" | "dodge" | "defend";
  role: "tank" | "healer" | "dps" | "all";
  response: CombatLocaleText;
  iconUrl: string | null;
  url: string;
  source: string;
  binding: string;
};
export type ReviewedEnemy = {
  npcId: number;
  name: CombatLocaleText;
  displayId: number | null;
  portraitUrl: string | null;
  abilities: ReviewedAbility[];
  note?: CombatLocaleText;
  url: string;
  source: string;
};
export type ReviewedCombat = {
  checkedAt: string;
  patch: string;
  sources: string[];
  enemies: ReviewedEnemy[];
};
