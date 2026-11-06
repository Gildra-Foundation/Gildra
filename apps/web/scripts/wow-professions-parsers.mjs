/** Parsers of the professions builder (scripts/build-wow-professions.mjs), kept apart so tests can load them. */

/** The `listviewspells` array of a Wowhead recipe list page. */
export function parseWowheadSpellList(html) {
  const start = html.indexOf("var listviewspells = ");
  if (start < 0) throw new Error("no recipe list in the page");
  const end = html.indexOf(";\n", start);
  const json = html.slice(start + "var listviewspells = ".length, end).replace(/([{,])([a-zA-Z_]+):/g, '$1"$2":');
  return JSON.parse(json);
}

/** Knowledge points registered by HandyNotes: zone constant, coordinates, flag quest, item. */
export function parseHandyNotesKnowledge(lua, zones) {
  const points = [];
  const block = /^ns\.RegisterPoints\(ns\.([A-Z_]+),\s*\{([\s\S]*?)^\},\s*KNOWLEDGE\)/gm;
  for (const match of lua.matchAll(block)) {
    const map = zones[match[1]];
    if (!map) throw new Error(`unknown HandyNotes zone ${match[1]}`);
    for (const line of match[2].split("\n")) {
      const point = line.match(/^\s*\[(\d{8})\]\s*=\s*\{quest=(\d+),\s*loot=\{(\d+)\}/);
      if (!point) continue;
      const coord = point[1];
      points.push({ map, x: Number(coord.slice(0, 4)) / 100, y: Number(coord.slice(4)) / 100, quest: Number(point[2]), item: Number(point[3]) });
    }
  }
  return points;
}

