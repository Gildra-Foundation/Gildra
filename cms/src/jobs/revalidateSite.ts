import { createHmac } from "node:crypto";
import type { PayloadRequest, TaskConfig } from "payload";

import type { ID } from "../access/roles";

export type RevalidationInput = {
  action: "change" | "unpublish" | "delete";
  collection: string;
  id: ID;
  site: ID | null;
  slug?: string;
  previousSlug?: string;
};

/** `CMS_REVALIDATE_SECRET_<SITE_SLUG>` — one secret per site so a leak stays local. */
export function revalidationSecretEnv(siteSlug: string): string {
  return `CMS_REVALIDATE_SECRET_${siteSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function signRevalidation(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Enqueue cache invalidation inside the caller's transaction, so a rolled back
 * publish never leaves a job behind. Concurrency control keeps delivery serial.
 */
export async function queueRevalidation(req: PayloadRequest, input: RevalidationInput): Promise<void> {
  if (input.site === null || input.site === undefined) return;
  await req.payload.jobs.queue({
    task: "revalidateSite",
    input: {
      action: input.action,
      collection: input.collection,
      docId: String(input.id),
      previousSlug: input.previousSlug ?? null,
      site: String(input.site),
      slug: input.slug ?? null,
    },
    req,
  });
}

type RevalidateTaskIO = {
  input: {
    action: "change" | "unpublish" | "delete";
    collection: string;
    docId: string;
    previousSlug?: string | null;
    site: string;
    slug?: string | null;
  };
  output: { status: string; httpStatus?: number | null };
};

export const revalidateSiteTask: TaskConfig<RevalidateTaskIO> = {
  slug: "revalidateSite",
  label: "Revalidate site cache",
  inputSchema: [
    { name: "site", type: "text", required: true },
    { name: "collection", type: "text", required: true },
    { name: "docId", type: "text", required: true },
    { name: "slug", type: "text" },
    { name: "previousSlug", type: "text" },
    { name: "action", type: "select", options: ["change", "unpublish", "delete"], required: true },
  ],
  outputSchema: [
    { name: "status", type: "text", required: true },
    { name: "httpStatus", type: "number" },
  ],
  // Preserve every URL transition: replacing a pending notification can lose
  // an earlier slug invalidation when several renames happen before the worker.
  concurrency: {
    key: ({ input }) => `revalidate:${input.site}:${input.collection}:${input.docId}`,
    supersedes: false,
  },
  retries: { attempts: 5, backoff: { type: "exponential", delay: 15_000 } },
  handler: async ({ input, req }) => {
    const site = await req.payload
      .findByID({ collection: "sites", id: input.site, depth: 0, overrideAccess: true, req, disableErrors: true })
      .catch(() => null);
    if (!site) return { output: { status: "site-missing" } };

    const url = typeof site.revalidateUrl === "string" ? site.revalidateUrl.trim() : "";
    const secret = process.env[revalidationSecretEnv(site.slug)] ?? "";
    // Not configured is a terminal, honest state: nothing to deliver, no retries.
    if (!url || !secret) return { output: { status: "not-configured" } };
    if (!/^https?:\/\//.test(url)) return { output: { status: "invalid-url" } };

    const body = JSON.stringify({
      action: input.action,
      collection: input.collection,
      id: input.docId,
      previousSlug: input.previousSlug ?? null,
      site: site.slug,
      slug: input.slug ?? null,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gildra-timestamp": timestamp,
        "x-gildra-signature": `sha256=${signRevalidation(secret, timestamp, body)}`,
      },
      body,
      signal: AbortSignal.timeout(Number(process.env.CMS_REVALIDATE_TIMEOUT_MS ?? 5_000)),
    });
    // Throwing marks the attempt failed; the retry policy above re-queues it.
    if (!response.ok) throw new Error(`Revalidation endpoint answered HTTP ${response.status}`);
    return { output: { status: "delivered", httpStatus: response.status } };
  },
};
