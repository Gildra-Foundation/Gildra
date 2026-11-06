/**
 * <JsonLd>: renders schema.org structured data next to the page content (Next.js
 * guide "JSON-LD"). The builders live in ./structuredData (plain TypeScript, tested).
 */
import type { JsonLdThing } from "./structuredData";

export * from "./structuredData";

/** `<script type="application/ld+json">`; `<` is escaped so page text can never close the tag. */
export function JsonLd({ data }: { data: JsonLdThing | JsonLdThing[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
