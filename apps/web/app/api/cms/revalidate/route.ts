import { revalidatePath, revalidateTag } from "next/cache";

import { cmsConfig } from "@/lib/cms/config";
import { createReplayGuard, MAX_BODY_BYTES, planInvalidation, verifyRevalidation } from "@/lib/cms/revalidation";
import { planPathInvalidation } from "@/lib/cms/staticPaths";

export const dynamic = "force-dynamic";

/**
 * Receiver for the shared CMS `revalidateSite` job (protocol in lib/cms/revalidation.ts).
 * Secret: CMS_REVALIDATE_SECRET (CMS side: CMS_REVALIDATE_SECRET_GILDRA). The
 * payload's `site` must equal CMS_SITE_SLUG. Edits use stale-while-revalidate
 * (`"max"`); unpublish/delete and renamed slugs expire immediately with
 * `{ expire: 0 }`, as the Next 16 docs prescribe for webhooks.
 */
const replay = createReplayGuard();

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ status: "too-large" }, { status: 413 });
  const rawBody = await request.text();
  const result = verifyRevalidation({
    secret: process.env.CMS_REVALIDATE_SECRET,
    site: cmsConfig().site,
    timestamp: request.headers.get("x-gildra-timestamp"),
    signature: request.headers.get("x-gildra-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
    replay,
  });
  if (!result.ok) return Response.json({ status: result.reason }, { status: result.status, headers: { "Cache-Control": "no-store" } });

  const plan = planInvalidation(result.body);
  for (const { tag, mode } of plan) revalidateTag(tag, mode === "expire" ? { expire: 0 } : "max");
  // Prerendered block pages built without the CMS carry no CMS tags (lib/cms/staticPaths.ts).
  for (const { path } of planPathInvalidation(result.body)) revalidatePath(path);
  return Response.json({ status: "ok", revalidated: plan }, { headers: { "Cache-Control": "no-store" } });
}
