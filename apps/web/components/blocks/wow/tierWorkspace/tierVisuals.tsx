/** Spec and tier colours shared by the tier board, the list and the comparison of /tier-lists. */
import type { CSSProperties } from "react";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import type { MaterialKit } from "@/components/wow/shared/materialAtlas";

const CLASS_KEYS: Record<string, string> = {
  "death-knight": "dk", "demon-hunter": "dh", evoker: "evoker", mage: "mage",
  paladin: "pal", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};
/** Tier → a dungeon kit whose accent colours the tier badge and row: ruby S, gold A, green B, teal C, violet D. */
const TIER_KITS: Record<string, MaterialKit> = { s: "ruby-life-pools", a: "kings-rest", b: "altar-of-fangs", c: "den-of-nalorakk", d: "voidscar-arena" };

export function classKey(slug: string) { return CLASS_KEYS[slug] ?? slug; }
/** Class colour token — used only on spec identity (icon frame, spec and class name, sim bar). */
export function classStyle(slug: string) { return { "--class-color": `var(--c-${classKey(slug)}, var(--atlas-text-muted))` } as CSSProperties; }
export function tierClass(tier: string) {
  const letter = tier.charAt(0).toLowerCase();
  return ["s", "a", "b", "c", "d", "f"].includes(letter) ? letter : "b";
}
/** F has no kit of its own: it wears the muted text tone, the bottom of the scale. */
export function tierStyle(tier: string) {
  const kit = TIER_KITS[tierClass(tier)];
  return { "--tier-accent": kit ? dungeonArtDirections[kit].accent : "var(--atlas-text-muted)" } as CSSProperties;
}
