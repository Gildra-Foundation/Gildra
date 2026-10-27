import { permanentRedirect } from "next/navigation";

export const dynamicParams = false;
export function generateStaticParams() { return [{ season: "midnight-season-1" }, { season: "midnight-season-2" }]; }
/** The current season is the Mythic+ hub itself; the first season has no published dungeon pool. */
export default function Page() { permanentRedirect("/ru/wow/mythic-plus"); }
