import type { Payload } from "payload";

import { captureMessage, monitoringEnabled } from "./sentry";

/**
 * Failed `revalidateSite` / `schedulePublish` jobs would otherwise sit silently
 * in the `payload-jobs` table (a published article that never reaches the
 * site). Called once per jobs-worker tick; reports each failure once per
 * process, then the row is left in place for the admin UI.
 */
const reported = new Set<string | number>();

export async function reportFailedJobs(payload: Payload): Promise<number> {
  if (!monitoringEnabled()) return 0;
  const failed = await payload.find({
    collection: "payload-jobs",
    where: { and: [{ hasError: { equals: true } }, { completedAt: { exists: false } }] },
    limit: 50,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  let fresh = 0;
  for (const job of failed.docs) {
    if (reported.has(job.id)) continue;
    reported.add(job.id);
    fresh++;
    captureMessage(`CMS job failed: ${job.taskSlug ?? "workflow"}`, {
      id: job.id,
      taskSlug: job.taskSlug,
      attempts: Array.isArray(job.log) ? job.log.length : undefined,
      error: JSON.stringify((job as { error?: unknown }).error ?? "").slice(0, 500),
    });
  }
  return fresh;
}
