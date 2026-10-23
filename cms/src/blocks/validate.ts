import { BLOCKS, blockLabel, type Lang, type Schema } from "./contract";

/**
 * Checks a page's `blocks` value exactly as the web app does before it renders
 * an override (apps/web/lib/cms/pages.ts + lib/blocks/contracts.ts): an array
 * of `{ type, props?, children? }`, known types, props matching the generated
 * contract, `children` only on container blocks, at most 6 levels of nesting.
 * The CMS is stricter in one way: only the page's allowed block types pass.
 * Unlike the site, which only says yes or no, every issue names the block, the
 * field and the reason, so the editor can fix it.
 */
export type IssueCode =
  | "not-array"
  | "not-object"
  | "missing-type"
  | "unknown-type"
  | "not-allowed"
  | "children-not-allowed"
  | "too-deep"
  | "missing"
  | "unknown-field"
  | "wrong-type";

export type BlockIssue = {
  /** 1-based position of the block, outermost first ([2, 1] = first child of block 2). Empty for the whole list. */
  block: number[];
  type?: string;
  /** Field path inside props, e.g. `sections[1].heading`; `children` for the child list. */
  field?: string;
  code: IssueCode;
  /** Expected value, e.g. `string` or `"meta" | "even"`. */
  expected?: string;
  allowed?: string[];
};

const MAX_DEPTH = 6;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Plain description of what a schema accepts. */
export function describeSchema(schema: Schema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.anyOf) return schema.anyOf.some((part) => Object.keys(part).length === 0) ? "any" : schema.anyOf.map(describeSchema).join(" | ");
  if (schema.type === "array") return `${schema.items ? describeSchema(schema.items) : "any"}[]`;
  return schema.type ?? "any";
}

/** Same rules as the web `matchesSchema`, but reports where and why a value fails. */
export function schemaIssues(value: unknown, schema: Schema, path: string): Omit<BlockIssue, "block">[] {
  const wrong = (): Omit<BlockIssue, "block">[] => [{ field: path, code: "wrong-type", expected: describeSchema(schema) }];
  if (schema.const !== undefined) return value === schema.const ? [] : wrong();
  if (schema.enum) return schema.enum.includes(value) ? [] : wrong();
  if (schema.anyOf) return schema.anyOf.some((part) => schemaIssues(value, part, path).length === 0) ? [] : wrong();
  switch (schema.type) {
    case "string":
      return typeof value === "string" ? [] : wrong();
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? [] : wrong();
    case "boolean":
      return typeof value === "boolean" ? [] : wrong();
    case "array":
      if (!Array.isArray(value)) return wrong();
      return schema.items ? value.flatMap((item, i) => schemaIssues(item, schema.items as Schema, `${path}[${i + 1}]`)) : [];
    case "object": {
      if (!isRecord(value)) return wrong();
      const at = (key: string) => (path ? `${path}.${key}` : key);
      const missing = (schema.required ?? []).filter((key) => value[key] === undefined).map((key) => ({ field: at(key), code: "missing" as const, expected: describeSchema(schema.properties?.[key] ?? {}) }));
      const rest = Object.entries(value).flatMap(([key, item]) => {
        if (item === undefined) return [];
        const property = schema.properties?.[key];
        if (property) return schemaIssues(item, property, at(key));
        if (schema.additionalProperties === false) return [{ field: at(key), code: "unknown-field" as const, allowed: Object.keys(schema.properties ?? {}) }];
        return typeof schema.additionalProperties === "object" ? schemaIssues(item, schema.additionalProperties, at(key)) : [];
      });
      return [...missing, ...rest];
    }
    default:
      return [];
  }
}

/**
 * Every issue of a blocks value; `allowed` limits the block types (the page's
 * list), `null` accepts every known type. `null`/`undefined` mean "no
 * override" and are valid.
 */
export function checkBlocks(value: unknown, allowed: readonly string[] | null): BlockIssue[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return [{ block: [], code: "not-array" }];
  const issues: BlockIssue[] = [];
  const walk = (list: unknown[], parent: number[], depth: number) => {
    list.forEach((raw, index) => {
      const block = [...parent, index + 1];
      if (!isRecord(raw)) return void issues.push({ block, code: "not-object" });
      if (typeof raw.type !== "string" || raw.type === "") return void issues.push({ block, code: "missing-type", allowed: allowed ? [...allowed] : undefined });
      const type = raw.type;
      const contract = BLOCKS[type];
      if (!contract) return void issues.push({ block, type, code: "unknown-type", allowed: allowed ? [...allowed] : Object.keys(BLOCKS) });
      if (allowed && !allowed.includes(type)) return void issues.push({ block, type, code: "not-allowed", allowed: [...allowed] });
      if (raw.props !== undefined && !isRecord(raw.props)) issues.push({ block, type, field: "props", code: "wrong-type", expected: "object" });
      else for (const issue of schemaIssues(raw.props ?? {}, contract.props, "")) issues.push({ ...issue, block, type });
      if (raw.children === undefined) return;
      if (!contract.container) return void issues.push({ block, type, field: "children", code: "children-not-allowed" });
      if (!Array.isArray(raw.children)) return void issues.push({ block, type, field: "children", code: "wrong-type", expected: "block[]" });
      if (depth + 1 > MAX_DEPTH) return void issues.push({ block, type, field: "children", code: "too-deep" });
      walk(raw.children, block, depth + 1);
    });
  };
  walk(value, [], 0);
  return issues;
}

const REASONS: Record<IssueCode, Record<Lang, (issue: BlockIssue) => string>> = {
  "not-array": { ru: () => "ожидается список блоков (JSON-массив)", en: () => "expected a list of blocks (a JSON array)" },
  "not-object": { ru: () => "блок должен быть объектом { type, props }", en: () => "a block must be an object { type, props }" },
  "missing-type": { ru: () => "не указан тип блока (type)", en: () => "the block type (type) is missing" },
  "unknown-type": {
    ru: (i) => `неизвестный тип блока${i.allowed?.length ? `. Для этой страницы доступны: ${i.allowed.join(", ")}` : ""}`,
    en: (i) => `unknown block type${i.allowed?.length ? `. Allowed on this page: ${i.allowed.join(", ")}` : ""}`,
  },
  "not-allowed": {
    ru: (i) => `этот блок нельзя поставить на эту страницу. Доступны: ${i.allowed?.join(", ")}`,
    en: (i) => `this block is not allowed on this page. Allowed: ${i.allowed?.join(", ")}`,
  },
  "children-not-allowed": { ru: () => "вложенные блоки есть только у контейнеров", en: () => "only container blocks can hold child blocks" },
  "too-deep": { ru: () => `больше ${MAX_DEPTH} уровней вложенности`, en: () => `more than ${MAX_DEPTH} levels of nesting` },
  missing: { ru: (i) => `обязательное поле не заполнено (${i.expected})`, en: (i) => `required field is missing (${i.expected})` },
  "unknown-field": {
    ru: (i) => `сайт не знает такого поля${i.allowed?.length ? `. Поля блока: ${i.allowed.join(", ")}` : ", у блока нет полей"}`,
    en: (i) => `the site has no such field${i.allowed?.length ? `. Block fields: ${i.allowed.join(", ")}` : "; the block has no fields"}`,
  },
  "wrong-type": { ru: (i) => `ожидается ${i.expected}`, en: (i) => `expected ${i.expected}` },
};

const RU_TYPES: Record<string, string> = { string: "строка", number: "число", boolean: "да/нет", object: "объект", any: "любое значение", "block[]": "список блоков" };

/** `expected` in the editor's language ("string[]" → "список: строка"). */
function expectedText(expected: string | undefined, lang: Lang): string {
  if (!expected || lang === "en") return expected ?? "";
  return expected
    .split(" | ")
    .map((part) => RU_TYPES[part] ?? (part.endsWith("[]") ? `список: ${RU_TYPES[part.slice(0, -2)] ?? part.slice(0, -2)}` : part))
    .join(" | ");
}

/** One readable sentence: block, field and reason. */
export function formatIssue(issue: BlockIssue, lang: Lang): string {
  const ru = lang === "ru";
  const where: string[] = [];
  if (issue.block.length) {
    const name = issue.type ? ` «${issue.type}»${BLOCKS[issue.type] ? ` (${blockLabel(issue.type, lang)})` : ""}` : "";
    where.push(`${ru ? "Блок" : "Block"} ${issue.block.join(" → ")}${ru ? name : name.replace(/«|»/g, '"')}`);
  } else where.push(ru ? "Блоки" : "Blocks");
  if (issue.field) where.push(`${ru ? "поле" : "field"} ${issue.field}`);
  return `${where.join(", ")}: ${REASONS[issue.code][lang]({ ...issue, expected: expectedText(issue.expected, lang) })}.`;
}
