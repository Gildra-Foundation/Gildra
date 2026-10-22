/**
 * Dedicated jobs runner (scheduled publishing, site cache invalidation).
 *   npm run jobs:worker
 *
 * Run exactly one of: this worker, or CMS_JOBS_AUTORUN=true in one CMS
 * process. Concurrency control in the jobs config keeps a second runner from
 * executing the same job twice, but one runner is the supported setup.
 */
import { getPayload } from "payload";

import { reportFailedJobs } from "../monitoring/jobs";
import { captureError, flushMonitoring } from "../monitoring/sentry";
import config from "../payload.config";

const intervalMs = Math.max(5, Number(process.env.CMS_JOBS_INTERVAL_SECONDS || 30)) * 1000;
const limit = Math.max(1, Number(process.env.CMS_JOBS_LIMIT || 25));

// This process must not also start the in-process cron runner.
process.env.CMS_JOBS_AUTORUN = "false";
const payload = await getPayload({ config });

let stopping = false;
const stop = () => {
  stopping = true;
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

payload.logger.info(`Jobs worker started (every ${intervalMs / 1000}s, limit ${limit}).`);
while (!stopping) {
  try {
    const result = await payload.jobs.run({ queue: "default", limit });
    const ran = Object.keys(result.jobStatus ?? {}).length;
    if (ran) payload.logger.info(`Jobs worker processed ${ran} job(s).`);
    await reportFailedJobs(payload);
  } catch (error) {
    payload.logger.error({ err: error, msg: "Jobs run failed" });
    captureError(error, { source: "jobs-worker" });
  }
  for (let waited = 0; waited < intervalMs && !stopping; waited += 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
payload.logger.info("Jobs worker stopped.");
await flushMonitoring();
process.exit(0);
