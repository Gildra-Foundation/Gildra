import config from "@payload-config";
import { type JSXConvertersFunction, RichText } from "@payloadcms/richtext-lexical/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createLocalReq, getPayload } from "payload";
import React from "react";

import { asStaff, sameID } from "@/access/roles";
import { loadPreview } from "@/public/endpoints";
import { parseLocale } from "@/utilities/http";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<{ token?: string; locale?: string }>;
};

type Block = { fields: { blockType: string; tone?: string; title?: string; body?: string; caption?: string; columns?: { label: string }[]; rows?: { cells?: { value?: string }[] }[] } };

/** Render the two custom blocks; everything else uses the default converters. */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  upload: ({ node }) => {
    const media = (node as { value?: { url?: string | null; alt?: string | null } }).value;
    // eslint-disable-next-line @next/next/no-img-element
    return media?.url ? <img src={media.url} alt={media.alt ?? ""} style={{ maxWidth: "100%" }} /> : null;
  },
  blocks: {
    callout: ({ node }: { node: unknown }) => {
      const f = (node as unknown as Block).fields;
      return (
        <aside style={{ borderLeft: "4px solid #2a78d6", padding: "8px 12px", background: "#fff", margin: "12px 0" }}>
          <strong>{f.title ?? f.tone}</strong>
          <p style={{ whiteSpace: "pre-wrap" }}>{f.body}</p>
        </aside>
      );
    },
    dataTable: ({ node }: { node: unknown }) => {
      const f = (node as unknown as Block).fields;
      return (
        <table style={{ borderCollapse: "collapse", margin: "12px 0" }}>
          {f.caption ? <caption>{f.caption}</caption> : null}
          <thead>
            <tr>{(f.columns ?? []).map((c, i) => <th key={i} style={{ border: "1px solid #ccc", padding: 4 }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {(f.rows ?? []).map((r, i) => (
              <tr key={i}>{(r.cells ?? []).map((c, j) => <td key={j} style={{ border: "1px solid #ccc", padding: 4 }}>{c.value}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    },
  },
});

/**
 * CMS-local preview of the latest draft. Requires both a valid short-lived
 * token and a staff session on the CMS domain belonging to the same user.
 */
export default async function PreviewPage({ params, searchParams }: Props) {
  const [{ collection, id }, query] = await Promise.all([params, searchParams]);
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  const staff = asStaff(user);
  if (!staff) notFound();

  const loc = parseLocale(query.locale);
  const req = await createLocalReq({ locale: loc }, payload);
  const result = await loadPreview(req, query.token, loc);
  if (result.status !== 200 || result.collection !== collection || !sameID(result.doc.id, id) || !sameID(result.user.id, staff.id)) {
    notFound();
  }
  const doc = result.doc as { title?: string | null; summary?: string | null; content?: unknown; cover?: { url?: string | null; alt?: string | null } | null };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ background: "#fff3cd", padding: "8px 12px", borderRadius: 4 }}>
        Draft preview ({loc.toUpperCase()}) — not public. {result.canPublish ? "You can publish this document." : "An editor must publish it."}
      </p>
      <h1>{doc.title}</h1>
      {doc.summary ? <p style={{ fontSize: 18 }}>{doc.summary}</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {doc.cover?.url ? <img src={doc.cover.url} alt={doc.cover.alt ?? ""} style={{ maxWidth: "100%" }} /> : null}
      {doc.content && typeof doc.content === "object" ? (
        <RichText data={doc.content as Parameters<typeof RichText>[0]["data"]} converters={converters} />
      ) : null}
    </main>
  );
}
