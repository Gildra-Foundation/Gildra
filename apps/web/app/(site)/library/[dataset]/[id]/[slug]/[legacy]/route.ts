import { legacyRecordRedirect } from "@/lib/library/legacyRecordRoute";

/** Old record address /library/<dataset>/<type>/<id>/<slug> → 308 to /library/<dataset>/<id>/<slug>. */
export const GET = legacyRecordRedirect("en");
