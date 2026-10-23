/**
 * Data colours of the atlas (roadmap item 6). The game's own colours stay where
 * they carry meaning — item quality, class — and never decorate chrome. Each
 * quality has a `frame` (borders, icon rims: the exact game colour) and a `text`
 * variant lightened just enough for WCAG AA (≥ 4.5:1) on every atlas surface.
 * Checked by tests/atlas/palette.test.ts.
 */
export const itemQualityColors = {
  0: { name: "poor", frame: "#9d9d9d", text: "#9d9d9d" },
  1: { name: "common", frame: "#ffffff", text: "#ffffff" },
  2: { name: "uncommon", frame: "#1eff00", text: "#1eff00" },
  3: { name: "rare", frame: "#0070dd", text: "#3590e6" },
  4: { name: "epic", frame: "#a335ee", text: "#ba63f3" },
  5: { name: "legendary", frame: "#ff8000", text: "#ff8000" },
  6: { name: "artifact", frame: "#e6cc80", text: "#e6cc80" },
  7: { name: "heirloom", frame: "#00ccff", text: "#00ccff" },
} as const satisfies Record<number, { name: string; frame: string; text: string }>;

/** Class colours of the game (also --c-* in app/styles/tokens.css). Class names on the atlas mix them 62 % with --atlas-text-strong. */
export const classColors = {
  "death-knight": "#c41e3a", "demon-hunter": "#a330c9", druid: "#ff7c0a", evoker: "#33937f", hunter: "#aad372", mage: "#3fc7eb",
  monk: "#00ff98", paladin: "#f48cba", priest: "#dfe3e8", rogue: "#fff468", shaman: "#0070dd", warlock: "#8788ee", warrior: "#c69b6d",
} as const;

/** Atlas surfaces data text must read on (app/styles/atlas-theme.css). */
export const atlasSurfaces = { bg: "#070b10", surface: "#0d131a", raised: "#151d27", selected: "#16212b" } as const;
export const atlasTextStrong = "#f2f6fa";
