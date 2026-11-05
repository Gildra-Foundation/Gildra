import type { Lang } from "@/lib/i18n-paths";
import { legacyLibraryRecordPath } from "@/lib/library/recordPath";

type LegacyParams = Promise<{ dataset: string; id: string; slug: string; legacy: string }>;

/**
 * Route handler of the old four-segment record address. The segments keep the
 * names of the new route ([dataset]/[id]/[slug]) and add one, so here `id` is
 * the old type, `slug` the record id and `legacy` the old slug. A route handler
 * answers a real 308 (a page would already have streamed its shell).
 */
export function legacyRecordRedirect(lang: Lang) {
  return async function GET(request: Request, { params }: { params: LegacyParams }) {
    const { id: type, slug: id, legacy: slug } = await params;
    const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
    const target = legacyLibraryRecordPath(lang, decode(type), decode(id), decode(slug), new URL(request.url).search);
    return new Response(null, { status: 308, headers: { Location: target } });
  };
}
