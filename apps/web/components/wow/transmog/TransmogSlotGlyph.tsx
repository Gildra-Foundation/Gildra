import type { TransmogSlot } from "@/lib/wow/transmog/model";
import styles from "./transmog.module.css";

/** Outline of an empty paper-doll slot, as the game draws an empty slot. */
const paths: Record<TransmogSlot, string> = {
  head: "M5 15c0-5 3-9 7-9s7 4 7 9v3H5zM9 18v2M15 18v2M8 12h8",
  shoulder: "M3 14c1-4 4-6 9-6s8 2 9 6l-3 2-2-3H8l-2 3z",
  back: "M7 4h10l2 16-7-3-7 3z",
  chest: "M8 4l-5 3 2 5 2-1v9h10v-9l2 1 2-5-5-3c-1 2-2 3-4 3s-3-1-4-3z",
  shirt: "M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3-4 3z",
  tabard: "M7 4h10v14l-5 3-5-3zM7 9h10",
  wrist: "M7 8h10v8H7zM7 12h10",
  hands: "M8 20v-7l-2-3 1-1 2 2V5h1.5v6V4h1.5v7V5h1.5v6V6H16v8l-1 6z",
  waist: "M3 10h18v4H3zM10 9h4v6h-4z",
  legs: "M7 4h10l1 16h-4l-2-10-2 10H6z",
  feet: "M8 4h4v10l7 3v3H5v-4l3-2z",
  "main-hand": "M15 3h6v6L10 20l-2-2 1-1-4-4 1-1 4 4z M4 20l3-3",
  "off-hand": "M12 3l7 3v6c0 5-4 8-7 9-3-1-7-4-7-9V6z",
};

export function SlotGlyph({ slot }: { slot: TransmogSlot }) {
  return (
    <svg className={styles.slotGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={paths[slot]} />
    </svg>
  );
}
