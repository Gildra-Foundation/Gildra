import { isolateObjectProperty, type PayloadRequest, type Where } from "payload";
import type { ID } from "./roles";
import { PAGE_SIZE } from "../components/workspace/query";

const pageMembers = new WeakMap<PayloadRequest, readonly ID[]>();

/** Extra narrowing for a server-selected page, never an access grant. */
export function profilePageWhere(req: PayloadRequest): Where | null {
  const ids = pageMembers.get(req);
  return ids ? { member: { in: [...ids] } } : null;
}

/**
 * Query validation cannot authorize the private `member` field without a doc.
 * Put the page constraint in collection access, preserving every normal ACL.
 * HTTP callers cannot set this private request scope.
 */
export async function profilesForPage(req: PayloadRequest, ids: readonly ID[]) {
  if (!ids.length) return [];
  if (ids.length > PAGE_SIZE) throw new Error("Invalid profile page size");
  const scoped = isolateObjectProperty(req, "context");
  scoped.context = { ...req.context };
  pageMembers.set(scoped, [...ids]);
  try {
    const result = await req.payload.find({ collection: "member-profiles", req: scoped, user: req.user,
      overrideAccess: false, depth: 0, pagination: false, limit: ids.length,
      select: { member: true, displayName: true, handle: true } });
    return result.docs;
  } finally {
    pageMembers.delete(scoped);
  }
}
