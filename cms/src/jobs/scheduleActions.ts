import { getUpcomingScheduledPublishHandler } from "@payloadcms/ui/utilities/schedulePublishHandler";
import type { schedulePublishHandler } from "@payloadcms/ui/utilities/schedulePublishHandler";
import { commitTransaction, Forbidden, initTransaction, killTransaction, type PayloadRequest } from "payload";
import { canUseAdmin, hasSiteRole, PUBLISH_ROLES, relationID, sameID } from "../access/roles";

type Target = { relationTo: "guides" | "pages"; value: number };

async function publishingTarget(req: PayloadRequest, input: unknown): Promise<Target> {
  if (!canUseAdmin(req.user) || !input || typeof input !== "object") throw new Forbidden(req.t);
  const { relationTo, value } = input as { relationTo?: unknown; value?: unknown };
  const id = relationID(value);
  if ((relationTo !== "guides" && relationTo !== "pages") || id === null) throw new Forbidden(req.t);
  const doc = await req.payload.findByID({ collection: relationTo, id, req, user: req.user,
    overrideAccess: false, draft: true, depth: 0, disableErrors: true });
  if (!doc || !hasSiteRole(req.user, doc.site, PUBLISH_ROLES)) throw new Forbidden(req.t);
  if (!/^\d{1,15}$/.test(String(id))) throw new Forbidden(req.t);
  return { relationTo, value: Number(id) };
}

/** Native drawers use these guarded server actions; raw jobs REST stays owner-only. */
export const secureSchedulePublish: typeof schedulePublishHandler = async ({ date, deleteID, doc, global, localeToPublish, req, type }) => {
  if (!canUseAdmin(req.user) || global) throw new Forbidden(req.t);
  let cancelTarget: Target | undefined;
  if (deleteID !== undefined) {
    const job = await req.payload.findByID({ collection: "payload-jobs", id: deleteID, req, user: req.user,
      overrideAccess: false, depth: 0, disableErrors: true });
    if (!job || job.taskSlug !== "schedulePublish") throw new Forbidden(req.t);
    cancelTarget = await publishingTarget(req, (job.input as { doc?: unknown } | undefined)?.doc);
  }
  const target = doc ? await publishingTarget(req, doc) : undefined;
  if (!target && !cancelTarget) throw new Forbidden(req.t);
  if (target && cancelTarget && (target.relationTo !== cancelTarget.relationTo || !sameID(target.value, cancelTarget.value))) throw new Forbidden(req.t);
  const waitUntil = date === undefined ? undefined : new Date(date);
  if (target && (type !== "publish" && type !== "unpublish" || !waitUntil || !Number.isFinite(waitUntil.getTime()))) throw new Forbidden(req.t);
  if (localeToPublish !== undefined && !["all", "en", "ru"].includes(localeToPublish)) throw new Forbidden(req.t);
  const started = await initTransaction(req);
  try {
    if (target) await req.payload.jobs.queue({ task: "schedulePublish", waitUntil, req,
      input: { type: type as "publish" | "unpublish", doc: target, locale: localeToPublish,
        user: { relationTo: "admins", value: req.user!.id } } });
    if (cancelTarget) await req.payload.delete({ collection: "payload-jobs", id: deleteID!, req, overrideAccess: true });
    if (started) await commitTransaction(req);
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
  return { message: req.i18n.t("general:success") };
};

export const secureUpcomingScheduledPublish: typeof getUpcomingScheduledPublishHandler = async (args) => {
  if (args.globalSlug) throw new Forbidden(args.req.t);
  await publishingTarget(args.req, { relationTo: args.collectionSlug, value: args.id });
  return getUpcomingScheduledPublishHandler(args);
};
