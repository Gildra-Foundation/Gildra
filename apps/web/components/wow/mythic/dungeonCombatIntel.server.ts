import "server-only";

import type { DungeonRoute } from "./dungeonRoutes";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { abilityIntel, abilitySource, enemyIntel } from "./rubyLifePoolsIntel";
import { enemyMedia, resolveAbilityMedia } from "./rubyLifePoolsMedia";

/** Pass only the current dungeon's combat card data to the client route. */
export function getDungeonCombatIntel(dungeon: DungeonRoute): DungeonCombatIntel {
  const enemies: DungeonCombatIntel["enemies"] = {};
  const abilities: DungeonCombatIntel["abilities"] = {};

  for (const stop of dungeon.stops) {
    for (const enemy of stop.enemies) {
      if (enemies[enemy.name]) continue;
      const media = enemyMedia[enemy.name];
      const legacyIntel = dungeon.slug === "ruby-life-pools" ? enemyIntel[enemy.name] : undefined;
      enemies[enemy.name] = {
        ...(legacyIntel ? { intel: legacyIntel } : {}),
        ...(media ? { media: {
          ...(media.npcId ? { npcId: media.npcId } : {}),
          ...(media.portraitUrl ? { portraitUrl: media.portraitUrl } : {}),
          ...(media.portraitScale !== undefined ? { portraitScale: media.portraitScale } : {}),
          ...(media.portraitY ? { portraitY: media.portraitY } : {}),
          ...(media.identityVerified ? { identityVerified: true } : {}),
          ...(media.portraitVerified ? { portraitVerified: true } : {}),
          ...(media.portraitStatus ? { portraitStatus: media.portraitStatus } : {}),
        } } : {}),
      };
    }

    for (const ability of stop.abilities) {
      if (abilities[ability.name]) continue;
      const resolved = resolveAbilityMedia(ability.name, ability.action);
      const legacyIntel = dungeon.slug === "ruby-life-pools" ? abilityIntel[ability.name] : undefined;
      const source = ability.source ?? (dungeon.slug === "ruby-life-pools" ? abilitySource[ability.name] : undefined);
      abilities[ability.name] = {
        ...(legacyIntel ? { intel: legacyIntel } : {}),
        ...(source ? { source } : {}),
        ...(resolved ? { media: {
          exact: resolved.exact,
          media: {
            ...(resolved.media.spellId ? { spellId: resolved.media.spellId } : {}),
            iconUrl: resolved.media.iconUrl,
            iconName: resolved.media.iconName,
          },
        } } : {}),
      };
    }
  }

  return { enemies, abilities };
}
