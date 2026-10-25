import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import styles from "./dungeonPullArt.module.css";

/** Carry the same material through the page and Valyro's portalled briefings. */
export function dungeonPullArtClass(slug: DungeonSlug): string {
  return `${styles.surface} ${styles[slug]}`;
}
