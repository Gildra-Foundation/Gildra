/**
 * Where each Midnight recipe is learned — parsers of saved Wowhead pages and the merge into the profession files.
 * Used by scripts/build-wow-profession-sources.mjs (collects data/wow/professions/sources/recipe-sources.json) and by
 * scripts/build-wow-professions.mjs (applies it on every rebuild). Facts only: NPC ids, costs, renown ranks, zones.
 */

const quoteKeys = (json) => json.replace(/([{,])\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*:/g, '$1"$2":');

/** A `var listview<name> = [...]` array of a Wowhead list page. */
export function parseListviewVar(html, name) {
  const marker = `var listview${name} = `;
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const end = html.indexOf(";\n", start);
  return JSON.parse(quoteKeys(html.slice(start + marker.length, end)));
}

/** The data array of a `new Listview({ … id: '<tab>' … data: [...] })` tab of a Wowhead entity page. */
export function parseListviewTab(html, tab) {
  const at = html.search(new RegExp(`id:\\s*'${tab}'`));
  if (at < 0) return [];
  const rest = html.slice(at);
  const data = rest.search(/data:\s*\[/);
  if (data < 0) return [];
  // The array ends where its brackets balance (strings may hold brackets).
  let depth = 0, inString = false, i = rest.indexOf("[", data);
  const from = i;
  for (; i < rest.length; i++) {
    const ch = rest[i];
    if (inString) { if (ch === "\\") i++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) break;
  }
  return JSON.parse(quoteKeys(rest.slice(from, i + 1)));
}

/** "Requires Renown Rank 5 with the Amani Tribe." → { faction: "Amani Tribe", rank: 5 }. */
export function parseRenown(text) {
  const match = String(text ?? "").replace(/<[^>]+>/g, "").match(/Renown Rank (\d+) with (?:the |The )?([A-Z][^.<"\\]*?)(?: and to know [^."]*)?\./);
  return match ? { faction: match[2].trim(), rank: Number(match[1]) } : null;
}

/** "Discovery: Camberon's Cauldron" in a recipe tooltip → the station's English name. */
export function parseDiscovery(tooltipHtml) {
  const match = String(tooltipHtml ?? "").match(/Discovery:\s*<\/span>([^<]+)</);
  return match ? match[1].trim() : null;
}

/** Wowhead cost cell `[[money, [[currency, n]], [[item, n]]]]` → our cost. */
export function parseCost(cost) {
  const [money = 0, currencies = [], items = []] = Array.isArray(cost?.[0]) ? cost[0] : [];
  return { ...(money > 0 ? { gold: money } : {}), ...(currencies.length ? { currencies } : {}), ...(items.length ? { items } : {}) };
}

/**
 * Adds `learn` (how and where the recipe is learned) to every recipe of a profession file and corrects `source`
 * where the recipe item shows the real source. Idempotent: an older `learn` is replaced.
 */
export function applyRecipeSources(data, facts) {
  const recipes = data.recipes.map((recipe) => {
    const { learn: _old, ...rest } = recipe;
    const fact = facts.recipes?.[recipe.spell];
    if (!fact) return rest;
    let source = rest.source;
    if (source === "research" && fact.vendors?.length) source = "vendor";
    else if (source === "research" && fact.drops?.length) source = "drop";
    const learn = {
      ...(fact.learnedAt && fact.learnedAt < 1000 ? { skill: fact.learnedAt } : {}),
      ...(fact.vendors?.length ? { vendors: fact.vendors.map((npc) => facts.places[npc]).filter(Boolean) } : {}),
      ...(fact.cost ? { cost: fact.cost } : {}),
      ...(fact.renown ? { renown: { faction: facts.factions[fact.renown.faction] ?? { en: fact.renown.faction, ru: fact.renown.faction }, rank: fact.renown.rank } } : {}),
      ...(fact.drops?.length ? { drops: fact.drops } : {}),
      ...(fact.station && facts.places[fact.station] ? { station: facts.places[fact.station] } : {}),
      ...(fact.recycling ? { recycling: true } : {}),
    };
    return { ...rest, source, ...(Object.keys(learn).length ? { learn } : {}) };
  });
  const currencies = {};
  for (const recipe of recipes) for (const [id] of recipe.learn?.cost?.currencies ?? []) if (facts.currencies?.[id]) currencies[id] = facts.currencies[id];
  for (const recipe of recipes) for (const [id] of recipe.learn?.cost?.items ?? []) if (facts.costItems?.[id]) currencies[`item:${id}`] = facts.costItems[id];
  const { currencies: _c, ...base } = data;
  return { ...base, recipes, ...(Object.keys(currencies).length ? { currencies } : {}) };
}
