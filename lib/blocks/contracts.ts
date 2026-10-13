import contracts from "@/contracts/blocks.schema.json";

/**
 * Block contracts (roadmap item 85): checks a block's props against the JSON
 * Schema generated from its TypeScript type (contracts/blocks.schema.json,
 * `npm run blocks:contracts`). Covers the subset the generator emits: type,
 * const, enum, anyOf, properties, required, additionalProperties, items.
 */
type Schema = {
  type?: "object" | "string" | "number" | "boolean" | "array";
  const?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
};

export function matchesSchema(value: unknown, schema: Schema): boolean {
  if (schema.const !== undefined) return value === schema.const;
  if (schema.enum) return schema.enum.includes(value);
  if (schema.anyOf) return schema.anyOf.some((part) => matchesSchema(value, part));
  switch (schema.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value) && (!schema.items || value.every((item) => matchesSchema(item, schema.items as Schema)));
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      if ((schema.required ?? []).some((key) => record[key] === undefined)) return false;
      return Object.entries(record).every(([key, item]) => {
        if (item === undefined) return true;
        const property = schema.properties?.[key];
        if (property) return matchesSchema(item, property);
        if (schema.additionalProperties === false) return false;
        return typeof schema.additionalProperties === "object" ? matchesSchema(item, schema.additionalProperties) : true;
      });
    }
    default: return true;
  }
}

const blocks = (contracts as { blocks: Record<string, { container: boolean; props: Schema }> }).blocks;

/** True when `props` (absent counts as {}) satisfy the block's contract; unknown types fail. */
export function blockPropsValid(type: string, props: unknown): boolean {
  const contract = blocks[type];
  return Boolean(contract) && matchesSchema(props ?? {}, contract.props);
}
