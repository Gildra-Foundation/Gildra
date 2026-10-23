import { BLOCKS, type BlockInstance, type Schema } from "../../blocks/contract";
import { checkBlocks, type BlockIssue } from "../../blocks/validate";

/**
 * Pure helpers of the blocks editor: what form control a contract property
 * gets, the value a new block starts with, and where validation issues land.
 * The stored value stays the web app's `BlockInstance[]`.
 */
export type Control =
  | { kind: "text"; multiline: boolean }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "choice"; options: string[]; free: boolean }
  | { kind: "list"; item: Schema }
  | { kind: "group"; schema: Schema }
  | { kind: "unsupported" };

/** Long text fields get a textarea. */
const MULTILINE = new Set(["text", "description"]);

export function controlFor(name: string, schema: Schema): Control {
  if (schema.enum) return { kind: "choice", options: schema.enum.map(String), free: false };
  if (schema.anyOf) {
    const consts = schema.anyOf.filter((part) => part.const !== undefined).map((part) => String(part.const));
    const free = schema.anyOf.some((part) => Object.keys(part).length === 0 || part.type === "string");
    if (consts.length) return { kind: "choice", options: consts, free };
    return free ? { kind: "text", multiline: false } : { kind: "unsupported" };
  }
  if (schema.const !== undefined) return { kind: "choice", options: [String(schema.const)], free: false };
  switch (schema.type) {
    case "string":
      return { kind: "text", multiline: MULTILINE.has(name) };
    case "number":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "array":
      return schema.items ? { kind: "list", item: schema.items } : { kind: "unsupported" };
    case "object":
      return { kind: "group", schema };
    default:
      return { kind: "unsupported" };
  }
}

/** Value a required property starts with, so a new block is valid at once. */
export function defaultFor(schema: Schema): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return defaultFor(schema.anyOf.find((part) => part.const !== undefined) ?? schema.anyOf[0] ?? {});
  switch (schema.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return Object.fromEntries((schema.required ?? []).map((key) => [key, defaultFor(schema.properties?.[key] ?? {})]));
    default:
      return null;
  }
}

export function newBlock(type: string): BlockInstance {
  const contract = BLOCKS[type];
  const props = contract ? (defaultFor(contract.props) as Record<string, unknown>) : {};
  return {
    type,
    ...(Object.keys(props).length ? { props } : {}),
    ...(contract?.container ? { children: [] } : {}),
  };
}

/** Writes `value` at `key` of props; empty optional values are removed, not stored as "". */
export function setProp(props: Record<string, unknown> | undefined, key: string, value: unknown, required: boolean): Record<string, unknown> | undefined {
  const next = { ...(props ?? {}) };
  if (!required && (value === "" || value === undefined || value === null)) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}

export function hasFields(type: string): boolean {
  return Object.keys(BLOCKS[type]?.props.properties ?? {}).length > 0;
}

/** Issues by block position ("2.1") for badges and inline field errors. */
export function issuesByBlock(value: unknown, allowed: readonly string[] | null): Map<string, BlockIssue[]> {
  const map = new Map<string, BlockIssue[]>();
  for (const issue of checkBlocks(value, allowed)) {
    const key = issue.block.join(".");
    map.set(key, [...(map.get(key) ?? []), issue]);
  }
  return map;
}

/** Issues of a block and everything nested in it. */
export function issuesWithin(map: Map<string, BlockIssue[]>, key: string): BlockIssue[] {
  return [...map.entries()].filter(([k]) => k === key || k.startsWith(`${key}.`)).flatMap(([, list]) => list);
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}
