import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from "payload";

import { relationID } from "../access/roles";

type AuditEntry = {
  action: string;
  targetCollection: string;
  targetId: string;
  site?: unknown;
  changes?: Record<string, { before: unknown; after: unknown }>;
};

/** Normalise relationship-bearing values so populated and raw docs compare equal. */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" && Object.keys(value as object).length > 1) continue;
      out[key] = key === "site" || key === "tenant" ? relationID(child) : normalise(child);
    }
    return out;
  }
  return value;
}

export async function writeAudit(req: PayloadRequest, entry: AuditEntry): Promise<void> {
  const actor = req.user as { collection?: string; id?: unknown; email?: string } | null | undefined;
  await req.payload.create({
    collection: "audit-log",
    data: {
      action: entry.action,
      actorCollection: actor?.collection ?? "system",
      actorId: actor?.id !== undefined ? String(actor.id) : null,
      actorEmail: actor?.email ?? null,
      targetCollection: entry.targetCollection,
      targetId: entry.targetId,
      site: relationID(entry.site) as number | null,
      changes: entry.changes ?? null,
    },
    overrideAccess: true,
    req,
  });
}

/** Audit only security-relevant fields; content history lives in versions. */
export function auditAfterChange(collection: string, fields: string[]): CollectionAfterChangeHook {
  return async ({ doc, operation, previousDoc, req }) => {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const field of fields) {
      const before = normalise(previousDoc?.[field] ?? null);
      const after = normalise(doc?.[field] ?? null);
      if (JSON.stringify(before) !== JSON.stringify(after)) changes[field] = { before, after };
    }
    if (operation === "update" && Object.keys(changes).length === 0) return doc;
    await writeAudit(req, {
      action: `${collection}.${operation}`,
      targetCollection: collection,
      targetId: String(doc.id),
      site: collection === "sites" ? doc.id : undefined,
      changes,
    });
    return doc;
  };
}

export function auditAfterDelete(collection: string): CollectionAfterDeleteHook {
  return async ({ doc, req }) => {
    await writeAudit(req, { action: `${collection}.delete`, targetCollection: collection, targetId: String(doc.id) });
    return doc;
  };
}
