import { createHmac, timingSafeEqual } from "node:crypto";

import { relationID } from "../access/roles";

/**
 * Short-lived preview tokens bound to one staff user, collection, document
 * and site. Signed with a key derived from PAYLOAD_SECRET; nothing is stored.
 */
export type PreviewClaims = {
  c: "guides" | "pages";
  id: string;
  site: string;
  uid: string;
  exp: number;
};

export const PREVIEW_TTL_SECONDS = 10 * 60;
const PREVIEWABLE = new Set(["guides", "pages"]);

function key(): Buffer {
  const secret = process.env.PAYLOAD_SECRET ?? "";
  if (!secret) throw new Error("PAYLOAD_SECRET is required for preview tokens");
  return createHmac("sha256", secret).update("gildra-preview-v1").digest();
}

const b64 = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function signPreview(claims: Omit<PreviewClaims, "exp">, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + PREVIEW_TTL_SECONDS }));
  const sig = b64(createHmac("sha256", key()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyPreview(token: unknown, now = Date.now()): PreviewClaims | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewClaims;
    if (!PREVIEWABLE.has(claims.c) || typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
    if (![claims.id, claims.site, claims.uid].every((v) => typeof v === "string" && v.length > 0)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** `admin.preview` implementation: CMS-local preview page for staff. */
export function previewUrlFor(collection: "guides" | "pages") {
  return (doc: Record<string, unknown>, { locale, req }: { locale: string; req: { user?: unknown } }) => {
    const user = req.user as { collection?: string; id?: unknown } | undefined;
    const site = relationID(doc.site);
    if (!user || user.collection !== "admins" || site === null || doc.id === undefined) return null;
    const token = signPreview({ c: collection, id: String(doc.id), site: String(site), uid: String(user.id) });
    const base = (process.env.PAYLOAD_PUBLIC_URL ?? "").replace(/\/$/, "");
    return `${base}/preview/${collection}/${doc.id}?locale=${encodeURIComponent(locale)}&token=${encodeURIComponent(token)}`;
  };
}
