import type { Access, Config, SanitizedConfig } from "payload";

import { asStaff, isOwner } from "./roles";

/**
 * Payload adds internal collections during sanitisation, after plugins run.
 * Several of them default to `Boolean(req.user)`, which would let any logged-in
 * reader (`members`) lock editorial documents or read migration rows over REST.
 * This narrows them to staff (document locks) or owners (migrations, KV).
 * `payload-preferences` keeps its own per-user access; `payload-jobs` is
 * configured in jobs/index.ts.
 */
const ACCESS_KEYS = ["create", "read", "update", "delete", "readVersions", "unlock"] as const;

function wrap(original: Access | undefined, gate: (user: unknown) => boolean): Access {
  return async (args) => {
    if (!gate(args.req.user)) return false;
    return original ? original(args) : true;
  };
}

const GATES: Record<string, (user: unknown) => boolean> = {
  "payload-locked-documents": (user) => asStaff(user) !== null,
  "payload-migrations": isOwner,
  "payload-kv": isOwner,
};

export function hardenInternalCollections(config: SanitizedConfig): SanitizedConfig {
  for (const collection of config.collections) {
    // A document's site is immutable (editorial/policy.ts), so drop the
    // plugin's "Assign tenant" menu item that would only lead to a 403.
    const edit = collection.admin?.components?.edit;
    if (edit?.editMenuItems) {
      edit.editMenuItems = edit.editMenuItems.filter(
        (item) => !(typeof item === "object" && item && "path" in item && String(item.path).includes("AssignTenantFieldTrigger")),
      );
    }
    const gate = GATES[collection.slug];
    if (!gate) continue;
    const access = collection.access as Record<string, Access | undefined>;
    for (const key of ACCESS_KEYS) access[key] = wrap(access[key], gate);
  }
  return config;
}

/**
 * The plugin's tenant field is never `required` (its own validator enforces a
 * value). Marking it required makes Postgres enforce NOT NULL for collections
 * without drafts. Drafts collections (guides, pages) cannot get NOT NULL from
 * the schema builder; their migration adds it by hand and the editorial hook
 * requires a site on every write, drafts included.
 */
export const requireSiteField =
  (slugs: string[]) =>
  (config: Config): Config => {
    for (const collection of config.collections ?? []) {
      if (!slugs.includes(collection.slug)) continue;
      const field = collection.fields.find((f) => "name" in f && f.name === "site");
      if (field && field.type === "relationship") (field as { required?: boolean }).required = true;
    }
    return config;
  };
