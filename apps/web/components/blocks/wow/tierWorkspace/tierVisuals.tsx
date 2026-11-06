/** Spec and tier visuals shared by the tier tables of /tier-lists (the ranking, the sim board). */
import type { CSSProperties } from "react";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import type { MaterialKit } from "@/components/wow/shared/materialAtlas";
import styles from "./tierWorkspace.module.css";

const CLASS_KEYS: Record<string, string> = {
  "death-knight": "dk", "demon-hunter": "dh", evoker: "evoker", mage: "mage",
  paladin: "pal", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};
/** Tier → the dungeon kit whose pull marker it wears; its accent colours the tier band. */
const TIER_KITS: Record<string, MaterialKit> = { s: "ruby-life-pools", a: "kings-rest", b: "altar-of-fangs", c: "den-of-nalorakk", d: "voidscar-arena" };

export function classKey(slug: string) { return CLASS_KEYS[slug] ?? slug; }
/** Class colour token — used only on spec identity (icon chip, class name, sim bar). */
export function classStyle(slug: string) { return { "--class-color": `var(--c-${classKey(slug)}, var(--atlas-text-muted))` } as CSSProperties; }
export function tierClass(tier: string) {
  const letter = tier.charAt(0).toLowerCase();
  return ["s", "a", "b", "c", "d"].includes(letter) ? letter : "b";
}
export function tierStyle(tier: string) { return { "--tier-accent": dungeonArtDirections[TIER_KITS[tierClass(tier)]].accent } as CSSProperties; }

/** The tier as a painted medallion (the pull marker of a dungeon kit) with the letter as live text. */
export function TierMark({ tier, label, size = "md" }: { tier: string; label: string; size?: "md" | "sm" }) {
  return <span className={size === "sm" ? `${styles.tierMark} ${styles.tierMarkSm}` : styles.tierMark} data-tier={tierClass(tier)} style={tierStyle(tier)}><span className={styles.srOnly}>{label} </span><span className={styles.tierLetter}>{tier}</span></span>;
}
