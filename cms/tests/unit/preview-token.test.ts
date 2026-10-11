import { beforeAll, describe, expect, it } from "vitest";

import { collectLexicalRefs } from "../../src/editorial/policy";
import { PREVIEW_TTL_SECONDS, signPreview, verifyPreview } from "../../src/preview/token";

beforeAll(() => {
  process.env.PAYLOAD_SECRET ||= "local-test-secret-only";
});

const claims = { c: "guides" as const, id: "5", site: "1", uid: "3" };

describe("preview tokens", () => {
  it("round-trips and binds every claim", () => {
    const token = signPreview(claims);
    expect(verifyPreview(token)).toMatchObject(claims);
  });

  it("expires after the TTL", () => {
    const issued = Date.now() - (PREVIEW_TTL_SECONDS + 5) * 1000;
    expect(verifyPreview(signPreview(claims, issued))).toBeNull();
  });

  it("rejects tampering, foreign keys and junk", () => {
    const token = signPreview(claims);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, site: "2", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyPreview(`${forged}.${sig}`)).toBeNull();
    expect(verifyPreview(`${body}.${sig}x`)).toBeNull();
    expect(verifyPreview(`${body}.${sig}.extra`)).toBeNull();
    expect(verifyPreview("")).toBeNull();
    expect(verifyPreview(undefined)).toBeNull();
    expect(verifyPreview(signPreview({ ...claims, c: "members" as never }))).toBeNull();
  });
});

describe("rich text reference scan", () => {
  it("finds uploads, relationships and internal links at any depth and locale", () => {
    const value = {
      en: { root: { children: [{ type: "upload", relationTo: "media", value: 4 }] } },
      ru: {
        root: {
          children: [
            { type: "paragraph", children: [{ type: "link", fields: { doc: { relationTo: "guides", value: { id: 9 } } } }] },
            { type: "relationship", relationTo: "members", value: 2 },
          ],
        },
      },
    };
    expect(collectLexicalRefs(value, "content")).toEqual([
      { collection: "media", id: 4, path: "content" },
      { collection: "guides", id: 9, path: "content" },
      { collection: "members", id: 2, path: "content" },
    ]);
  });
});
