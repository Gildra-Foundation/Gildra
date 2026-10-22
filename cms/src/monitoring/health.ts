import { getPayload } from "payload";

import config from "../payload.config";

/**
 * Liveness + database readiness for the compose healthcheck and uptime
 * probes. Deliberately tiny: `/admin` renders the whole admin shell, which is
 * a poor thing to hit every 10 seconds.
 */
export async function healthStatus(): Promise<{ ok: boolean; db: boolean }> {
  try {
    const payload = await getPayload({ config });
    await payload.db.pool.query("select 1");
    return { ok: true, db: true };
  } catch {
    return { ok: false, db: false };
  }
}
