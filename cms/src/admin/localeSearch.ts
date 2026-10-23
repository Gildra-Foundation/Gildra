import type { CollectionBeforeOperationHook, Config, Where } from "payload";

const OPERATORS = ["like", "contains"] as const;
const MAX_MATCHES = 500;
const SEARCHING = "gildraTitleSearch";

type TitleMatch = (operator: (typeof OPERATORS)[number], query: unknown) => Promise<(string | number)[]>;

/**
 * Payload's list search looks only into the selected content language, so
 * "воин" finds nothing while English is selected. A text match on `title` also
 * accepts documents whose title in any language matches; the rest of the
 * query (site scope, status, access) still applies on top.
 */
export async function searchTitlesInAllLocales(where: Where | undefined, titleMatch: TitleMatch): Promise<Where | undefined> {
  if (!where) return where;
  const next: Where = {};
  for (const [key, value] of Object.entries(where)) {
    if ((key === "and" || key === "or") && Array.isArray(value)) {
      next[key] = await Promise.all(value.map(async (part) => (await searchTitlesInAllLocales(part as Where, titleMatch)) ?? {}));
    } else if (key === "title" && value && typeof value === "object" && OPERATORS.some((op) => op in value)) {
      const op = OPERATORS.find((candidate) => candidate in value)!;
      const ids = await titleMatch(op, (value as Record<string, unknown>)[op]);
      const own: Where = { title: value as never };
      next.and = [...(next.and ?? []), ids.length ? { or: [own, { id: { in: ids } }] } : own];
    } else {
      next[key] = value as never;
    }
  }
  return next;
}

export const widenTitleSearch: CollectionBeforeOperationHook = async ({ args, operation, collection, req }) => {
  if (operation !== "read" || req.context?.[SEARCHING] || !args || typeof args !== "object" || !("where" in args) || !args.where) return args;
  const draft = Boolean((args as { draft?: boolean }).draft);
  const titleMatch: TitleMatch = async (op, query) => {
    const { docs } = await req.payload.find({
      collection: collection.slug as never, draft, locale: "all", depth: 0, limit: MAX_MATCHES, pagination: false,
      overrideAccess: true, context: { [SEARCHING]: true }, select: { id: true } as never, where: { title: { [op]: query } } as never,
    });
    return docs.map((doc) => (doc as { id: string | number }).id);
  };
  return { ...args, where: await searchTitlesInAllLocales(args.where as Where, titleMatch) };
};

export function withTitleSearchInAllLocales<T extends Pick<Config, "collections">>(config: T): T {
  for (const collection of config.collections ?? []) {
    if (collection.slug !== "guides" && collection.slug !== "pages") continue;
    collection.hooks = { ...collection.hooks, beforeOperation: [...(collection.hooks?.beforeOperation ?? []), widenTitleSearch] };
  }
  return config;
}
