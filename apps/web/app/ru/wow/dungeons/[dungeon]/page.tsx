import { permanentRedirect } from "next/navigation";
import { dungeonRoutes } from "@/lib/data/wow/mythic/dungeonRoutes";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ dungeon })); }
/** Each dungeon has one page: its season route. */
export default async function Page({ params }: { params: Promise<{ dungeon: string }> }) {
  permanentRedirect(`/ru/wow/mythic-plus/midnight-season-2/${(await params).dungeon}`);
}
