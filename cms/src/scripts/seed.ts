/**
 * Idempotent seed: creates the Gildra and Riftden sites and their settings if
 * missing. Never creates, changes or prints accounts or passwords.
 *   npm run seed
 */
import { getPayload } from "payload";

import config from "../payload.config";
import { seedSites } from "../seed/sites";

const payload = await getPayload({ config });
try {
  const report = await seedSites(payload);
  payload.logger.info(
    `Seed finished. Created sites: ${report.createdSites.join(", ") || "none"}; created settings: ${report.createdSettings.join(", ") || "none"}.`,
  );
  process.exit(0);
} catch (error) {
  payload.logger.error({ err: error, msg: "Seed failed" });
  process.exit(1);
}
