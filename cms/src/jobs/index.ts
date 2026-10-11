import {
  type Access,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type CollectionSlug,
  type Field,
  Forbidden,
  type JobsConfig,
  type Where,
} from "payload";

import { hasSiteRole, isOwner, PUBLISH_ROLES, relationID, siteIDsWithRole } from "../access/roles";
import { revalidateSiteTask } from "./revalidateSite";

const SCHEDULABLE = new Set(["guides", "pages"]);

/**
 * Payload's schedule drawer only checks admin-panel access before queueing a
 * `schedulePublish` job. This hook makes scheduling require the same
 * publishing role the immediate publish would need, and stamps the job with
 * the document's site for scoped reads. The task itself re-checks at run time
 * because it updates as the scheduling user with `overrideAccess: false`.
 */
const guardJobs: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== "create") return data;
  const input = (data.input ?? {}) as Record<string, unknown>;

  if (data.taskSlug === "revalidateSite") {
    data.site = input.site ? Number(input.site) || input.site : null;
    return data;
  }
  if (data.taskSlug !== "schedulePublish") return data;

  if (input.global) throw new Forbidden(req.t);
  const doc = input.doc as { relationTo?: string; value?: unknown } | undefined;
  // Payload >= 3.90 stores the scheduling user as { relationTo, value } and
  // refuses to run plain-ID (legacy) jobs. Only staff accounts may schedule.
  const scheduler = input.user as { relationTo?: unknown; value?: unknown } | null | undefined;
  const userID = scheduler && typeof scheduler === "object" && scheduler.relationTo === "admins" ? relationID(scheduler.value) : null;
  if (!doc?.relationTo || !SCHEDULABLE.has(doc.relationTo) || relationID(doc.value) === null || userID === null) {
    throw new Forbidden(req.t);
  }
  const [user, target] = await Promise.all([
    req.payload.findByID({ collection: "admins", id: userID, depth: 0, overrideAccess: true, req, disableErrors: true }),
    req.payload.findByID({
      collection: doc.relationTo as CollectionSlug,
      id: relationID(doc.value)!,
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
      disableErrors: true,
    }),
  ]);
  const site = relationID((target as { site?: unknown } | null)?.site);
  if (!user || !target || site === null || !hasSiteRole({ ...user, collection: "admins" }, site, PUBLISH_ROLES)) {
    throw new Forbidden(req.t);
  }
  data.site = site;
  return data;
};

/**
 * Payload 3.90 appends task log rows with an atomic `{ $push: row }` update,
 * which only the DB adapter understands. With `runHooks: true` (needed by
 * `guardJobs`) the update first passes field processing, whose shape check
 * rejects a non-array `log`, so every finished task would be recorded as
 * failed and retried. This adapter keeps the semantics:
 * - a field hook turns `{ $push: row | rows }` into existing rows + new rows
 *   (jobs are processed one at a time; concurrency control is enabled);
 * - a row's `error` is required only when `state` is `failed` (Payload marks
 *   it required for every row although its own admin condition and the
 *   nullable DB column treat it as failed-only).
 */
type LogRow = Record<string, unknown> & { state?: unknown };

function adaptTaskLog(fields: Field[]): Field[] {
  return fields.map((field) => {
    if (field.type === "array" && field.name === "log") {
      return {
        ...field,
        hooks: {
          ...field.hooks,
          beforeChange: [
            ...(field.hooks?.beforeChange ?? []),
            ({ value, previousValue }) => {
              if (!value || typeof value !== "object" || Array.isArray(value) || !("$push" in value)) return value;
              const pushed = (value as { $push: LogRow | LogRow[] }).$push;
              const existing = Array.isArray(previousValue) ? (previousValue as LogRow[]) : [];
              return [...existing, ...(Array.isArray(pushed) ? pushed : [pushed])];
            },
          ],
        },
        fields: field.fields.map((sub) =>
          "name" in sub && sub.name === "error" && sub.type === "json"
            ? {
                ...sub,
                required: false,
                validate: (v: unknown, { siblingData }: { siblingData: LogRow }) =>
                  siblingData?.state === "failed" && (v === undefined || v === null) ? "An error is required for failed tasks." : true,
              }
            : sub,
        ),
      } as Field;
    }
    if ("fields" in field && Array.isArray(field.fields)) return { ...field, fields: adaptTaskLog(field.fields) } as Field;
    if (field.type === "tabs") return { ...field, tabs: field.tabs.map((tab) => ({ ...tab, fields: adaptTaskLog(tab.fields) })) } as Field;
    return field;
  });
}

const readJobs: Access = ({ req }) => {
  if (isOwner(req.user)) return true;
  const sites = siteIDsWithRole(req.user, PUBLISH_ROLES);
  if (!sites.length) return false;
  // Publishers see (and the schedule drawer lists) scheduled publications of their sites only.
  const where: Where = { and: [{ taskSlug: { equals: "schedulePublish" } }, { site: { in: sites } }] };
  return where;
};

const ownerOnly = ({ req }: { req: { user?: unknown } }): boolean => isOwner(req.user);

export const jobsConfig: JobsConfig = {
  tasks: [revalidateSiteTask],
  // Route queueing through collection hooks so `guardJobs` always runs.
  runHooks: true,
  enableConcurrencyControl: true,
  access: { cancel: ownerOnly, queue: ownerOnly, run: ownerOnly },
  // In-process runner for a single CMS instance. Enable it in exactly one
  // process (CMS_JOBS_AUTORUN=true) or use `npm run jobs:worker` instead.
  autoRun: [{ cron: process.env.CMS_JOBS_CRON || "* * * * *", queue: "default", limit: 25 }],
  shouldAutoRun: () => process.env.CMS_JOBS_AUTORUN === "true",
  jobsCollectionOverrides: ({ defaultJobsCollection }): CollectionConfig => ({
    ...defaultJobsCollection,
    access: {
      ...defaultJobsCollection.access,
      read: readJobs,
      create: ownerOnly,
      update: ownerOnly,
      delete: ownerOnly,
      unlock: ownerOnly,
    },
    fields: [
      ...adaptTaskLog(defaultJobsCollection.fields),
      { name: "site", type: "relationship", relationTo: "sites", index: true, admin: { readOnly: true } },
    ],
    hooks: {
      ...defaultJobsCollection.hooks,
      beforeChange: [...(defaultJobsCollection.hooks?.beforeChange ?? []), guardJobs],
    },
  }),
};
