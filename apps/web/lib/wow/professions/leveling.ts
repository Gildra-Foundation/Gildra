import type { ProfessionItem, ProfessionPrice, ProfessionPrices, ProfessionRecipe, RecipeSource } from "./types";

/** The auction house keeps 5% of every sale. */
export const AUCTION_CUT = 0.05;
export const PROFESSION_MAX_SKILL = 100;
/** Recipes every crafter can get without buying them: known, trainer, research and specialization unlocks. */
export const DEFAULT_ROUTE_SOURCES: readonly RecipeSource[] = ["start", "trainer", "research", "specialization"];
export const ROUTE_SOURCES: readonly RecipeSource[] = ["start", "trainer", "research", "specialization", "vendor", "quest", "drop"];

type Items = Record<string, ProfessionItem>;

export const professionIconUrl = (icon: string | null | undefined) => icon ? `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg` : null;

/** The cheapest way to get one unit of a reagent: the cheapest listed rank, else the vendor price. */
export function reagentPrice(itemId: number, items: Items, prices: ProfessionPrices): { item: number; rank: number; price: number; vendor: boolean } | null {
  const ranks = items[itemId]?.ranks ?? [itemId];
  let best: { item: number; rank: number; price: number; vendor: boolean } | null = null;
  ranks.forEach((id, index) => {
    const price = prices[id]?.min;
    if (price && (!best || price < best.price)) best = { item: id, rank: index + 1, price, vendor: false };
  });
  const vendor = items[itemId]?.vendor;
  if (vendor && (!best || vendor < (best as { price: number }).price)) best = { item: itemId, rank: 1, price: vendor, vendor: true };
  return best;
}

/** Reagent cost of one craft at current prices, or null when a reagent has no price. */
export function craftCost(recipe: ProfessionRecipe, items: Items, prices: ProfessionPrices): number | null {
  let total = 0;
  for (const [item, qty] of recipe.reagents) {
    const price = reagentPrice(item, items, prices);
    if (!price) return null;
    total += price.price * qty;
  }
  return total;
}

/** Chance that a craft at this skill gives skill points: certain until yellow, falling to zero at grey. */
export function skillUpChance(recipe: Pick<ProfessionRecipe, "yellow" | "grey">, skill: number) {
  if (skill >= recipe.grey) return 0;
  if (skill < recipe.yellow) return 1;
  return (recipe.grey - skill) / Math.max(1, recipe.grey - recipe.yellow);
}

/**
 * Lowest skill at which the route uses a recipe. Starting and trainer recipes are there from the first point; a recipe
 * unlocked later (research, specialization, a vendor, a drop) is taken no earlier than 20 points before it turns
 * yellow, so the route does not lean on a high-end recipe a beginner cannot have yet.
 */
export function recipeFloor(recipe: Pick<ProfessionRecipe, "source" | "yellow">) {
  return recipe.source === "start" || recipe.source === "trainer" ? 1 : Math.max(1, recipe.yellow - 20);
}

export type RouteStep = { recipe: ProfessionRecipe; from: number; to: number; crafts: number; cost: number | null };
export type Route = { steps: RouteStep[]; reached: number; trainingCost: number; priced: boolean };

/**
 * Cheapest way from one skill level to another: at every level the recipe with the lowest expected cost per skill
 * point (reagent cost ÷ chance ÷ points per skill-up). Without prices the reagent count stands in for the cost.
 * Neighbouring levels on the same recipe merge into one step; a recipe within 2% of the best keeps its step.
 */
export function planRoute(recipes: readonly ProfessionRecipe[], items: Items, prices: ProfessionPrices,
  { from = 1, to = PROFESSION_MAX_SKILL, sources = DEFAULT_ROUTE_SOURCES }: { from?: number; to?: number; sources?: readonly RecipeSource[] } = {}): Route {
  const priced = Object.keys(prices).length > 0;
  const usable = recipes.filter((recipe) => sources.includes(recipe.source));
  const cost = new Map(usable.map((recipe) => [recipe.id, priced ? craftCost(recipe, items, prices) : recipe.reagents.reduce((sum, [, qty]) => sum + qty, 0)]));
  const steps: (RouteStep & { expected: number })[] = [];
  let skill = Math.max(1, Math.floor(from));
  const target = Math.min(PROFESSION_MAX_SKILL, Math.max(skill, Math.floor(to)));
  for (; skill < target; skill++) {
    let best: { recipe: ProfessionRecipe; perPoint: number; expected: number } | null = null;
    const current = steps.at(-1)?.recipe;
    for (const recipe of usable) {
      const unit = cost.get(recipe.id), chance = skillUpChance(recipe, skill);
      if (unit === null || unit === undefined || chance <= 0 || skill < recipeFloor(recipe)) continue;
      const expected = 1 / (chance * recipe.ups), perPoint = unit * expected;
      if (!best || perPoint < best.perPoint - 1e-9 || (Math.abs(perPoint - best.perPoint) < 1e-9 && recipe.grey > best.recipe.grey)) best = { recipe, perPoint, expected };
    }
    if (!best) break;
    if (current && current.id !== best.recipe.id) {
      const unit = cost.get(current.id), chance = skillUpChance(current, skill);
      if (unit !== null && unit !== undefined && chance > 0 && unit / (chance * current.ups) <= best.perPoint * 1.02) best = { recipe: current, perPoint: unit / (chance * current.ups), expected: 1 / (chance * current.ups) };
    }
    const last = steps.at(-1);
    if (last && last.recipe.id === best.recipe.id && last.to === skill) { last.to = skill + 1; last.expected += best.expected; }
    else steps.push({ recipe: best.recipe, from: skill, to: skill + 1, crafts: 0, cost: null, expected: best.expected });
  }
  const used = new Set<number>();
  let trainingCost = 0;
  const result = steps.map(({ expected, ...step }) => {
    const crafts = Math.max(1, Math.ceil(expected - 1e-6));
    const unit = priced ? cost.get(step.recipe.id) ?? null : null;
    if (!used.has(step.recipe.id)) { used.add(step.recipe.id); trainingCost += step.recipe.trainingCost ?? 0; }
    return { ...step, crafts, cost: unit === null ? null : unit * crafts };
  });
  return { steps: result, reached: skill, trainingCost, priced };
}

export type ShoppingEntry = { item: number; qty: number; buy: { item: number; rank: number; vendor: boolean } | null };

/** Reagents of the whole route by item (rank 1 as the key), with the rank that is cheapest to buy. */
export function shoppingList(steps: readonly RouteStep[], items: Items, prices: ProfessionPrices): ShoppingEntry[] {
  const totals = new Map<number, number>();
  for (const step of steps) for (const [item, qty] of step.recipe.reagents) totals.set(item, (totals.get(item) ?? 0) + qty * step.crafts);
  return [...totals].map(([item, qty]) => {
    const price = reagentPrice(item, items, prices);
    return { item, qty, buy: price ? { item: price.item, rank: price.rank, vendor: price.vendor } : null };
  }).sort((a, b) => b.qty - a.qty || a.item - b.item);
}

/** What buying `wanted` units costs: walks the cheapest auction lots, the vendor price is flat. */
export function buyCost(entry: ShoppingEntry, wanted: number, items: Items, prices: ProfessionPrices): { total: number; short: number } | null {
  if (!entry.buy) return null;
  const need = Math.max(0, Math.floor(wanted));
  if (entry.buy.vendor) return { total: need * (items[entry.item]?.vendor ?? 0), short: 0 };
  const price: ProfessionPrice | undefined = prices[entry.buy.item];
  if (!price) return null;
  let left = need, total = 0;
  for (const [unit, qty] of price.ladder) {
    if (left <= 0) break;
    const take = Math.min(left, qty);
    total += take * unit; left -= take;
  }
  // Beyond the listed levels, the last known price stands in.
  if (left > 0) total += left * (price.ladder.at(-1)?.[0] ?? price.median);
  return { total, short: Math.max(0, need - price.quantity) };
}

export type ProfitRow = { recipe: ProfessionRecipe; cost: number; sale: number; median: number; output: number; revenue: number; margin: number };

/** Recipes whose reagents and product are both on the auction house, by margin after the auction cut. */
export function profitRows(recipes: readonly ProfessionRecipe[], items: Items, prices: ProfessionPrices): ProfitRow[] {
  const rows: ProfitRow[] = [];
  for (const recipe of recipes) {
    if (!recipe.output) continue;
    const cost = craftCost(recipe, items, prices);
    const ranks = recipe.output.ranks ?? [recipe.output.item];
    const output = ranks.find((id) => prices[id]);
    if (cost === null || output === undefined) continue;
    const price = prices[output];
    const revenue = recipe.output.qty * price.min * (1 - AUCTION_CUT);
    rows.push({ recipe, cost, sale: price.min, median: price.median, output, revenue, margin: revenue - cost });
  }
  return rows.sort((a, b) => b.margin - a.margin);
}

/** Every item id whose price a profession page needs: all reagent and product ranks, gathered goods. */
export function professionPriceIds(recipes: readonly ProfessionRecipe[], items: Items, gathered: readonly number[] = []) {
  const ids = new Set<number>();
  const add = (id: number) => { for (const rank of items[id]?.ranks ?? [id]) ids.add(rank); };
  for (const recipe of recipes) {
    recipe.reagents.forEach(([id]) => add(id));
    if (recipe.output) for (const id of recipe.output.ranks ?? [recipe.output.item]) ids.add(id);
  }
  gathered.forEach(add);
  return [...ids].sort((a, b) => a - b);
}

/** TomTom waypoint: `/way #<map> x y name`. */
export const wayCommand = (place: { map: number; x: number; y: number }, name: string) =>
  `/way #${place.map} ${place.x.toFixed(1)} ${place.y.toFixed(1)} ${name}`.trim();

/** A /run line that prints, for each numbered treasure, whether its flag quest is done. */
export function treasureMacro(quests: readonly number[], words: { done: string; missing: string }) {
  return `/run for i,q in ipairs({${quests.join(",")}}) do print(i, C_QuestLog.IsQuestFlaggedCompleted(q) and "${words.done}" or "${words.missing}") end`;
}
