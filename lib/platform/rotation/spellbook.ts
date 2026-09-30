import type { TalentCalculatorData, TalentKind } from "@/lib/talentCalculatorData";
import { decodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import type { RotationAbility } from "./types";

const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/gi, "");

export function buildRotationSpellbook({ baseAbilities, talentData, talentLoadout }: {
  baseAbilities: RotationAbility[];
  talentData: TalentCalculatorData | null;
  talentLoadout: string;
}) {
  const catalog = new Map<string, RotationAbility>();
  const spellIds = new Map<number, string>();
  const names = new Map<string, string>();
  for (const ability of baseAbilities) {
    const enriched = { ...ability, category: ability.category ?? "core", source: ability.source ?? "maintained-apl" } satisfies RotationAbility;
    catalog.set(ability.id, enriched);
    if (ability.spellId) spellIds.set(ability.spellId, ability.id);
    names.set(normalize(ability.name), ability.id);
  }
  if (!talentData) return [...catalog.values()];

  const decoded = decodeWoWTalentLoadout(talentData, talentLoadout);
  const kinds: TalentKind[] = ["class", "spec", "hero"];
  for (const kind of kinds) {
    for (const node of talentData.trees[kind].nodes) {
      if (!node.freeNode && (!decoded || !decoded.ranks.has(node.id))) continue;
      const selectedEntry = decoded?.choices.get(node.id);
      const choice = node.choices.find((item) => item.externalId === selectedEntry) ?? node.choices[0];
      if (!choice || choice.talentType !== "active") continue;
      const existingId = (choice.spellId ? spellIds.get(choice.spellId) : undefined) ?? names.get(normalize(choice.name));
      const id = existingId ?? `talent-spell-${choice.spellId ?? choice.externalId}`;
      const existing = catalog.get(id);
      const ability: RotationAbility = {
        id,
        name: choice.name,
        hint: choice.description,
        iconUrl: !choice.iconFallback && choice.iconUrl ? choice.iconUrl : existing?.iconUrl ?? choice.iconUrl ?? "",
        spellId: choice.spellId ?? existing?.spellId,
        category: kind,
        source: "active-talent",
      };
      catalog.set(id, { ...existing, ...ability });
      if (ability.spellId) spellIds.set(ability.spellId, id);
      names.set(normalize(ability.name), id);
    }
  }
  return [...catalog.values()];
}
