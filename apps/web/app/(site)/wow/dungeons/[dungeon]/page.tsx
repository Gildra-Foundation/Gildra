import { notFound, permanentRedirect } from "next/navigation";
import { dungeonSlugs } from "@/components/wow/mythic/dungeonRoutes";

export const dynamicParams = false;
export function generateStaticParams() { return dungeonSlugs.map(dungeon => ({ dungeon })); }
export default async function Page({ params, searchParams }: {
  params: Promise<{ dungeon: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { dungeon } = await params;
  if (!dungeonSlugs.some(slug => slug === dungeon)) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  permanentRedirect(`/wow/mythic-plus/midnight-season-2/${dungeon}${query.size ? `?${query}` : ""}`);
}
