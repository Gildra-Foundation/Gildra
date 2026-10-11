import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrations } from "../src/migrations";
import { withClient } from "./helpers/db";
import { bootPayload } from "./helpers/payload";

let payload: Payload;
let url: string;

beforeAll(async () => {
  ({ payload, url } = await bootPayload("fresh"));
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("fresh install", () => {
  it("migrates an empty database to the full schema with both sites and no accounts", async () => {
    const ran = await withClient(url, (c) => c.query("SELECT name FROM payload_migrations WHERE name <> 'dev' ORDER BY id"));
    expect(ran.rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name));
    const sites = await payload.find({ collection: "sites", overrideAccess: true, sort: "slug" });
    expect(sites.docs.map((s) => [s.slug, s.domain, s.game])).toEqual([
      ["gildra", "gildra.net", "wow"],
      ["riftden", "riftden.com", "lol"],
    ]);
    expect((await payload.count({ collection: "admins", overrideAccess: true })).totalDocs).toBe(0);
    expect((await payload.count({ collection: "members", overrideAccess: true })).totalDocs).toBe(0);
  });
});
