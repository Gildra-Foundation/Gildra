import {
  type Access,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
  type CollectionSlug,
  Forbidden,
  type PayloadRequest,
  ValidationError,
  type Where,
} from "payload";

import {
  asStaff,
  hasSiteRole,
  type ID,
  inSites,
  isOwner,
  PUBLISH_ROLES,
  relationID,
  sameID,
  type SiteRole,
  siteIDsWithRole,
  WRITE_ROLES,
} from "../access/roles";
import { queueRevalidation } from "../jobs/revalidateSite";

/** Collections whose documents carry a `site` relationship (multi-tenant plugin). */
export const SITE_SCOPED_COLLECTIONS = ["guides", "pages", "media", "categories", "tags", "site-settings"] as const;

export type RelationRule = {
  /** Dot path inside the document data, e.g. `seo.image`. */
  path: string;
  collection: "media" | "categories" | "tags" | "admins";
};

export type EditorialPolicy = {
  /** Collection uses `versions.drafts` and therefore `_status`. */
  drafts: boolean;
  /** Roles that may create and update. */
  writeRoles: SiteRole[];
  /** Roles that may change live content (publish/unpublish/schedule). */
  publishRoles: SiteRole[];
  /** Roles that may delete. */
  deleteRoles: SiteRole[];
  /** Field holding the staff author; authors may only touch their own documents. */
  authorField?: string;
  /** Explicit relationship fields that must point at the same site. */
  relations: RelationRule[];
  /** Anonymous/members read: `published` for drafts collections, `all` for public taxonomy/media. */
  publicRead: "published" | "all";
  /** Whether a change should enqueue site cache invalidation. */
  revalidate: boolean;
};

export const ARTICLE_POLICY: EditorialPolicy = {
  drafts: true,
  writeRoles: WRITE_ROLES,
  publishRoles: PUBLISH_ROLES,
  deleteRoles: PUBLISH_ROLES,
  authorField: "author",
  relations: [
    { path: "hero", collection: "media" },
    { path: "seo.image", collection: "media" },
    { path: "categories", collection: "categories" },
    { path: "tags", collection: "tags" },
    { path: "author", collection: "admins" },
  ],
  publicRead: "published",
  revalidate: true,
};

const draftWriteKey = (slug: string) => `gildra:draftWrite:${slug}`;
/** Context flag for server-side bootstrap writes (seed) that need no site cache invalidation. */
export const SKIP_REVALIDATION = "gildra:skipRevalidation";

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function editorialAccess(policy: EditorialPolicy): CollectionConfig["access"] {
  const publicWhere: Where | true = policy.publicRead === "published" ? { _status: { equals: "published" } } : true;

  const read: Access = ({ req }) => {
    if (isOwner(req.user)) return true;
    const staffSites = siteIDsWithRole(req.user, policy.writeRoles);
    if (asStaff(req.user) && staffSites.length > 0) {
      // The multi-tenant plugin additionally limits staff to their assigned sites.
      return publicWhere === true ? true : { or: [{ site: { in: staffSites } }, publicWhere] };
    }
    return publicWhere;
  };

  const readVersions: Access = ({ req }) => {
    if (isOwner(req.user)) return true;
    return inSites("version.site", siteIDsWithRole(req.user, policy.writeRoles));
  };

  const create: Access = ({ req }) => isOwner(req.user) || siteIDsWithRole(req.user, policy.writeRoles).length > 0;

  const update: Access = ({ req }) => {
    if (isOwner(req.user)) return true;
    const writers = siteIDsWithRole(req.user, policy.writeRoles);
    if (!policy.authorField || !req.user) return inSites("site", writers);
    // Publishers edit everything on their sites; authors only their own documents.
    const full = siteIDsWithRole(req.user, policy.publishRoles).filter((id) => writers.some((w) => String(w) === String(id)));
    const limited = writers.filter((id) => !full.some((f) => String(f) === String(id)));
    const clauses: Where[] = [];
    if (full.length) clauses.push({ site: { in: full } });
    if (limited.length) {
      clauses.push({ and: [{ site: { in: limited } }, { [policy.authorField]: { equals: req.user.id } }] });
    }
    if (clauses.length === 0) return false;
    return clauses.length === 1 ? clauses[0] : { or: clauses };
  };

  const remove: Access = ({ req }) => {
    if (isOwner(req.user)) return true;
    return inSites("site", siteIDsWithRole(req.user, policy.deleteRoles));
  };

  return {
    read,
    create,
    update,
    delete: remove,
    unlock: remove,
    ...(policy.drafts ? { readVersions } : {}),
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Records whether the running write only saves a draft version (live row and
 * public output untouched). `beforeChange` hooks do not receive the `draft`
 * argument, so it is captured here per collection.
 */
export const captureWriteMode: CollectionBeforeOperationHook = ({ args, operation, req, collection }) => {
  if (operation !== "create" && operation !== "update" && operation !== "restoreVersion") return args;
  const a = args as { draft?: boolean; data?: { _status?: string }; unpublishAllLocales?: unknown };
  let draftWrite = a.draft === true;
  if (operation === "update") {
    draftWrite = draftWrite && a.data?._status !== "published" && !a.unpublishAllLocales;
  }
  req.context[draftWriteKey(collection.slug)] = draftWrite;
  return args;
};

export function isDraftWrite(req: PayloadRequest, slug: string): boolean {
  return req.context[draftWriteKey(slug)] === true;
}

function readPath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

type Ref = { collection: string; id: ID; path: string };

/** Upload/relationship/internal-link nodes inside Lexical JSON (any locale shape). */
export function collectLexicalRefs(value: unknown, path: string, out: Ref[] = [], depth = 0): Ref[] {
  if (!value || typeof value !== "object" || depth > 64) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectLexicalRefs(item, path, out, depth + 1);
    return out;
  }
  const node = value as Record<string, unknown>;
  if ((node.type === "upload" || node.type === "relationship") && typeof node.relationTo === "string") {
    const id = relationID(node.value);
    if (id !== null) out.push({ collection: node.relationTo, id, path });
  }
  if ((node.type === "link" || node.type === "autolink") && node.fields && typeof node.fields === "object") {
    const doc = (node.fields as Record<string, unknown>).doc as { relationTo?: unknown; value?: unknown } | undefined;
    const id = relationID(doc?.value);
    if (doc && typeof doc.relationTo === "string" && id !== null) out.push({ collection: doc.relationTo, id, path });
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "value" && (node.type === "upload" || node.type === "relationship")) continue;
    collectLexicalRefs(child, path, out, depth + 1);
  }
  return out;
}

const LEXICAL_TARGETS = new Set(["media", "guides", "pages"]);

function invalid(collection: string, path: string, message: string): ValidationError {
  return new ValidationError({ collection, errors: [{ message, path }] });
}

/**
 * Every referenced document must belong to the same site. Runs for drafts and
 * autosave too (field validation is skipped there, hooks are not).
 */
export async function assertSameSiteReferences(args: {
  collection: string;
  data: Record<string, unknown>;
  richTextFields: string[];
  relations: RelationRule[];
  req: PayloadRequest;
  site: ID;
}): Promise<void> {
  const { collection, data, req, site } = args;
  const refs: Ref[] = [];
  for (const rule of args.relations) {
    const raw = readPath(data, rule.path);
    if (raw === undefined || raw === null) continue;
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      const id = relationID(item);
      if (id !== null) refs.push({ collection: rule.collection, id, path: rule.path });
    }
  }
  for (const field of args.richTextFields) {
    for (const ref of collectLexicalRefs(data[field], field)) {
      if (!LEXICAL_TARGETS.has(ref.collection)) {
        throw invalid(collection, field, `Rich text may not reference "${ref.collection}".`);
      }
      refs.push(ref);
    }
  }

  const byCollection = new Map<string, Ref[]>();
  for (const ref of refs) byCollection.set(ref.collection, [...(byCollection.get(ref.collection) ?? []), ref]);

  for (const [target, list] of byCollection) {
    const ids = [...new Set(list.map((r) => String(r.id)))];
    const found = await req.payload.find({
      collection: target as CollectionSlug,
      where: { id: { in: ids } },
      depth: 0,
      limit: ids.length,
      pagination: false,
      overrideAccess: true,
      draft: target === "guides" || target === "pages" ? true : undefined,
      req,
    });
    const docs = new Map(found.docs.map((d) => [String(d.id), d as unknown as Record<string, unknown>]));
    for (const ref of list) {
      const doc = docs.get(String(ref.id));
      if (!doc) throw invalid(collection, ref.path, `Referenced ${target} #${ref.id} does not exist.`);
      if (target === "admins") {
        // Documents loaded with find() carry no auth `collection`; mark them as staff explicitly.
        if (!hasSiteRole({ ...doc, collection: "admins" }, site, WRITE_ROLES)) {
          throw invalid(collection, ref.path, "The author has no editorial role on this site.");
        }
        continue;
      }
      if (!sameID(doc.site, site)) {
        throw invalid(collection, ref.path, `Referenced ${target} #${ref.id} belongs to another site.`);
      }
    }
  }
}

/**
 * Server-side tenant integrity for every site-scoped collection:
 * the site is required and immutable, the acting staff member needs a write
 * role there, authors stay on their own documents, live changes need a
 * publishing role and every relationship stays inside the site.
 */
export function enforceSiteIntegrity(policy: EditorialPolicy, richTextFields: string[] = []): CollectionBeforeChangeHook {
  return async ({ collection, data, operation, originalDoc, req }) => {
    const slug = collection.slug;
    const before = relationID(originalDoc?.site);
    const incoming = data.site === undefined ? undefined : relationID(data.site);

    if (operation === "update" && before !== null && incoming !== undefined && !sameID(incoming, before)) {
      throw new Forbidden(req.t);
    }
    const site = incoming ?? before;
    if (site === null || site === undefined) throw invalid(slug, "site", "A site is required.");

    const user = req.user;
    if (user) {
      if (!asStaff(user) || !hasSiteRole(user, site, policy.writeRoles)) throw new Forbidden(req.t);
      const canPublish = hasSiteRole(user, site, policy.publishRoles);

      if (policy.authorField && !canPublish) {
        const field = policy.authorField;
        if (operation === "create") {
          data[field] = user.id;
        } else {
          if (!sameID(originalDoc?.[field], user.id)) throw new Forbidden(req.t);
          if (data[field] !== undefined && !sameID(data[field], user.id)) throw new Forbidden(req.t);
        }
      }

      if (policy.drafts && !isDraftWrite(req, slug) && !canPublish) {
        // `originalDoc` is the latest *version* (often a newer draft), not the
        // live row, so the live status is read from the main table itself.
        let liveStatus: unknown;
        if (operation === "update" && originalDoc?.id !== undefined) {
          const live = await req.payload.db.findOne({ collection: slug, where: { id: { equals: originalDoc.id } }, req });
          liveStatus = (live as { _status?: unknown } | null)?._status;
        }
        const resulting = (data._status as string | undefined) ?? (originalDoc?._status as string | undefined) ?? "draft";
        if (resulting === "published" || liveStatus === "published" || originalDoc?._status === "published") {
          throw new Forbidden(req.t);
        }
      }
    }

    await assertSameSiteReferences({ collection: slug, data, relations: policy.relations, richTextFields, req, site });

    if (policy.drafts && data._status === "published" && !data.publishedAt && !originalDoc?.publishedAt) {
      data.publishedAt = new Date().toISOString();
    }
    data.site = site;
    return data;
  };
}

/** Enqueue per-site cache invalidation when public output may have changed. */
export const revalidateAfterChange: CollectionAfterChangeHook = async ({ collection, doc, previousDoc, req }) => {
  if (req.context[SKIP_REVALIDATION] === true) return doc;
  const drafts = Boolean(collection.versions && typeof collection.versions === "object" && collection.versions.drafts);
  if (drafts) {
    if (isDraftWrite(req, collection.slug)) return doc;
    if (doc._status !== "published" && previousDoc?._status !== "published") return doc;
  }
  await queueRevalidation(req, {
    action: drafts && doc._status !== "published" ? "unpublish" : "change",
    collection: collection.slug,
    id: doc.id,
    previousSlug: typeof previousDoc?.slug === "string" ? previousDoc.slug : undefined,
    site: relationID(doc.site),
    slug: typeof doc.slug === "string" ? doc.slug : undefined,
  });
  return doc;
};

export const revalidateAfterDelete: CollectionAfterDeleteHook = async ({ collection, doc, req }) => {
  const drafts = Boolean(collection.versions && typeof collection.versions === "object" && collection.versions.drafts);
  if (drafts && doc._status !== "published") return doc;
  await queueRevalidation(req, {
    action: "delete",
    collection: collection.slug,
    id: doc.id,
    site: relationID(doc.site),
    slug: typeof doc.slug === "string" ? doc.slug : undefined,
  });
  return doc;
};

/** Hooks + access for a site-scoped editorial collection. */
export function withEditorialPolicy(
  config: CollectionConfig,
  policy: EditorialPolicy,
  richTextFields: string[] = [],
): CollectionConfig {
  return {
    ...config,
    access: editorialAccess(policy),
    hooks: {
      ...config.hooks,
      beforeOperation: [captureWriteMode, ...(config.hooks?.beforeOperation ?? [])],
      beforeChange: [...(config.hooks?.beforeChange ?? []), enforceSiteIntegrity(policy, richTextFields)],
      afterChange: [...(config.hooks?.afterChange ?? []), ...(policy.revalidate ? [revalidateAfterChange] : [])],
      afterDelete: [...(config.hooks?.afterDelete ?? []), ...(policy.revalidate ? [revalidateAfterDelete] : [])],
    },
  };
}
