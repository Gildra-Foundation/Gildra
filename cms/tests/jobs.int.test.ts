import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signRevalidation } from "../src/jobs/revalidateSite";
import { as, bootPayload, lexical, makeStaff } from "./helpers/payload";

let payload: Payload;
let gildra: number;
type Staff = Awaited<ReturnType<typeof makeStaff>>;
let editor: Staff, author: Staff;

let server: Server;
let serverStatus = 200;
const received: { headers: IncomingMessage["headers"]; body: string }[] = [];

const SECRET = "local-revalidate-secret";

async function draft(slug: string, by: Staff) {
  return payload.create({
    collection: "guides",
    data: { site: gildra, slug, title: slug, summary: "S", content: lexical("x") } as never,
    draft: true,
    depth: 0,
    ...as(by),
  });
}

const jobsFor = (task: string) =>
  payload.find({ collection: "payload-jobs", where: { taskSlug: { equals: task } }, overrideAccess: true, depth: 0, sort: "createdAt", limit: 100 });

beforeAll(async () => {
  ({ payload } = await bootPayload("jobs"));
  gildra = (await payload.find({ collection: "sites", where: { slug: { equals: "gildra" } }, overrideAccess: true })).docs[0].id;
  // The first account is always bootstrapped as owner; create it explicitly.
  await makeStaff(payload, { email: "owner@test.local", owner: true });
  editor = await makeStaff(payload, { email: "editor@test.local", sites: [{ site: gildra, role: "editor" }] });
  author = await makeStaff(payload, { email: "author@test.local", sites: [{ site: gildra, role: "author" }] });

  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = serverStatus;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

afterAll(async () => {
  server?.close();
  await payload?.db.destroy?.();
});

describe("scheduled publishing", () => {
  it("publishes a due document exactly once and is safe to re-run", async () => {
    const doc = await draft("scheduled", editor);
    const later = await draft("later", editor);
    await payload.jobs.queue({
      task: "schedulePublish",
      input: { type: "publish", doc: { relationTo: "guides", value: String(doc.id) }, user: { relationTo: "admins", value: editor.id } } as never,
      waitUntil: new Date(Date.now() - 1000),
    });
    await payload.jobs.queue({
      task: "schedulePublish",
      input: { type: "publish", doc: { relationTo: "guides", value: String(later.id) }, user: { relationTo: "admins", value: editor.id } } as never,
      waitUntil: new Date(Date.now() + 24 * 3600_000),
    });

    await payload.jobs.run({ queue: "default" });
    const published = await payload.findByID({ collection: "guides", id: doc.id, overrideAccess: true, depth: 0 });
    expect(published._status).toBe("published");
    expect(published.publishedAt).toBeTruthy();


    const versionsBefore = (await payload.countVersions({ collection: "guides", where: { parent: { equals: doc.id } }, overrideAccess: true })).totalDocs;
    await payload.jobs.run({ queue: "default" });
    await payload.jobs.run({ queue: "default" });
    const versionsAfter = (await payload.countVersions({ collection: "guides", where: { parent: { equals: doc.id } }, overrideAccess: true })).totalDocs;
    expect(versionsAfter).toBe(versionsBefore);

    // Completed jobs are removed (Payload default); only the future one remains.
    const jobs = await jobsFor("schedulePublish");
    expect(jobs.docs).toHaveLength(1);
    expect(jobs.docs[0].completedAt ?? null).toBeNull();
    expect(jobs.docs[0].site).toBe(gildra);
    expect((await payload.findByID({ collection: "guides", id: later.id, overrideAccess: true }))._status).toBe("draft");
  });

  it("re-checks rights at run time: a demoted scheduler cannot publish", async () => {
    const doc = await draft("demoted", editor);
    await payload.jobs.queue({
      task: "schedulePublish",
      input: { type: "publish", doc: { relationTo: "guides", value: String(doc.id) }, user: { relationTo: "admins", value: editor.id } } as never,
      waitUntil: new Date(Date.now() - 1000),
    });
    await payload.update({ collection: "admins", id: editor.id, data: { sites: [{ site: gildra, role: "author" }] } as never, overrideAccess: true });
    const result = await payload.jobs.run({ queue: "default" });
    expect((await payload.findByID({ collection: "guides", id: doc.id, overrideAccess: true }))._status).toBe("draft");
    // The failure is recorded on the job (Payload 3.90 log rows via $push work with runHooks).
    const failedID = Object.keys(result.jobStatus ?? {})[0];
    const failed = await payload.findByID({ collection: "payload-jobs", id: failedID, overrideAccess: true, depth: 0 });
    expect(failed.hasError).toBe(true);
    expect((failed.log ?? []).at(-1)).toMatchObject({ taskSlug: "schedulePublish", state: "failed" });
    await payload.update({ collection: "admins", id: editor.id, data: { sites: [{ site: gildra, role: "editor" }] } as never, overrideAccess: true });
  });

  it("refuses legacy plain-ID and non-staff schedulers at queue time", async () => {
    const doc = await draft("legacy-shape", editor);
    for (const user of [editor.id, { relationTo: "members", value: editor.id }, null]) {
      await expect(
        payload.jobs.queue({
          task: "schedulePublish",
          input: { type: "publish", doc: { relationTo: "guides", value: String(doc.id) }, user } as never,
          waitUntil: new Date(Date.now() - 1000),
        }),
      ).rejects.toThrow();
    }
  });

  it("refuses to queue a schedule for an author", async () => {
    const doc = await draft("by-author", author);
    await expect(
      payload.jobs.queue({
        task: "schedulePublish",
        input: { type: "publish", doc: { relationTo: "guides", value: String(doc.id) }, user: { relationTo: "admins", value: author.id } } as never,
        waitUntil: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow();
  });
});

describe("site cache invalidation", () => {
  it("records an honest not-configured result without retrying", async () => {
    const before = (await jobsFor("revalidateSite")).totalDocs;
    const doc = await draft("not-configured", editor);
    await payload.update({ collection: "guides", id: doc.id, data: { _status: "published" } as never, ...as(editor) });
    const queued = await jobsFor("revalidateSite");
    expect(queued.totalDocs).toBe(before + 1);
    const result = await payload.jobs.run({ queue: "default" });
    expect(result.jobStatus?.[String(queued.docs.at(-1)!.id)]).toMatchObject({ status: "success" });
    // Completed (not retried) and removed; nothing was sent anywhere.
    expect((await jobsFor("revalidateSite")).totalDocs).toBe(before);
    expect(received).toHaveLength(0);
  });

  it("delivers a signed notification and retries failures", async () => {
    const port = (server.address() as AddressInfo).port;
    process.env.CMS_REVALIDATE_SECRET_GILDRA = SECRET;
    await payload.update({ collection: "sites", id: gildra, data: { revalidateUrl: `http://127.0.0.1:${port}/api/cms/revalidate` }, overrideAccess: true });

    // Draft saves do not notify the site.
    const doc = await draft("signed", editor);
    await payload.update({ collection: "guides", id: doc.id, data: { title: "draft only" }, draft: true, ...as(editor) });
    await payload.jobs.run({ queue: "default" });
    expect(received).toHaveLength(0);

    serverStatus = 500;
    await payload.update({ collection: "guides", id: doc.id, data: { _status: "published" } as never, ...as(editor) });
    await payload.jobs.run({ queue: "default" });
    expect(received).toHaveLength(1);
    const failed = (await jobsFor("revalidateSite")).docs.at(-1)!;
    expect(failed.completedAt ?? null).toBeNull();
    expect(failed.totalTried).toBeGreaterThanOrEqual(1);

    serverStatus = 200;
    await payload.update({ collection: "payload-jobs", id: failed.id, data: { waitUntil: new Date(Date.now() - 1000).toISOString() } as never, overrideAccess: true });
    const retried = await payload.jobs.run({ queue: "default" });
    expect(retried.jobStatus?.[String(failed.id)]).toMatchObject({ status: "success" });
    expect(received).toHaveLength(2);

    const last = received.at(-1)!;
    const body = JSON.parse(last.body);
    expect(body).toMatchObject({ site: "gildra", collection: "guides", slug: "signed", action: "change" });
    const ts = String(last.headers["x-gildra-timestamp"]);
    expect(last.headers["x-gildra-signature"]).toBe(`sha256=${signRevalidation(SECRET, ts, last.body)}`);
    expect(last.headers["x-gildra-signature"]).not.toBe(`sha256=${signRevalidation("wrong", ts, last.body)}`);

    // Unpublishing notifies too.
    await payload.update({ collection: "guides", id: doc.id, data: { _status: "draft" } as never, ...as(editor) });
    await payload.jobs.run({ queue: "default" });
    expect(JSON.parse(received.at(-1)!.body).action).toBe("unpublish");
    delete process.env.CMS_REVALIDATE_SECRET_GILDRA;
  });
});
