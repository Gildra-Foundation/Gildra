// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorldMapPage, worldMapMetadata } from "@/components/wow/worldMap/WorldMapPage";
import { mapPageParam } from "@/lib/wow/worldMap/bundle";
import { worldMapPageByParam, worldMapPages } from "@/lib/wow/worldMap/data.server";

// Every map page is prerendered; any other address is a real 404.
export const dynamicParams = false;

type PageProps = { params: Promise<{ map: string }> };

export function generateStaticParams() {
  return worldMapPages().map((map) => ({ map: mapPageParam(map) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const map = worldMapPageByParam((await params).map, "en");
  return map ? worldMapMetadata("en", map) : {};
}

export default async function WorldMapZoneRoute({ params }: PageProps) {
  const map = worldMapPageByParam((await params).map, "en");
  if (!map) notFound();
  return <WorldMapPage lang="en" map={map} />;
}
