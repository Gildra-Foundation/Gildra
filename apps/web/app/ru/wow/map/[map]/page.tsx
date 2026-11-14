// Generated from app/(site)/wow/map/[map]/page.tsx by npm run routes:mirror — edit the English page.
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
  const map = worldMapPageByParam((await params).map, "ru");
  return map ? worldMapMetadata("ru", map) : {};
}

export default async function WorldMapZoneRoute({ params }: PageProps) {
  const map = worldMapPageByParam((await params).map, "ru");
  if (!map) notFound();
  return <WorldMapPage lang="ru" map={map} />;
}
