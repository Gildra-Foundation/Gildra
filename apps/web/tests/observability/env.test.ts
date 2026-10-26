import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apiInternalUrl, checkServerEnv } from "../../lib/env.ts";

describe("server environment", () => {
  it("accepts the production shape and names switched-off features", () => {
    const { errors, warnings } = checkServerEnv({
      API_INTERNAL_URL: "http://api:8080", CATALOG_ACCESS_MODE: "public",
      INDEXNOW_KEY: "0123456789abcdef", BATTLENET_REGION: "EU", SENTRY_TRACES_SAMPLE_RATE: "0",
      BATTLENET_CLIENT_ID: "id",
    });
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((warning) => warning.startsWith("BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET")));
    assert.ok(warnings.some((warning) => warning.startsWith("AUTH_SECRET is not set")));
  });

  it("rejects values that would break the site", () => {
    const { errors } = checkServerEnv({
      API_INTERNAL_URL: "api:8080", CATALOG_ACCESS_MODE: "open", SENTRY_TRACES_SAMPLE_RATE: "10",
      INDEXNOW_KEY: "short", WOW_META_API_ENABLED: "yes", SENTRY_DSN: "ftp://x@y/1",
    });
    assert.equal(errors.length, 6, errors.join("\n"));
  });

  it("defaults and trims the API base URL", () => {
    assert.equal(apiInternalUrl({}), "http://api:8080");
    assert.equal(apiInternalUrl({ API_INTERNAL_URL: "  " }), "http://api:8080");
    assert.equal(apiInternalUrl({ API_INTERNAL_URL: "https://api.gildra.net/" }), "https://api.gildra.net");
  });
});
