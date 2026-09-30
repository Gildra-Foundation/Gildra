import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlueprintViewer } from "@/components/blueprints/BlueprintViewer";
import { blueprints, getBlueprint, getBlueprintsForGame } from "@/components/blueprints/catalog";

type BlueprintPageProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  return blueprints.map((blueprint) => ({ slug: blueprint.slug.split("/") }));
}

export async function generateMetadata({ params }: BlueprintPageProps): Promise<Metadata> {
  const { slug } = await params;
  const blueprint = getBlueprint(slug.join("/"));
  if (!blueprint) return {};

  return {
    title: `${blueprint.title} — Gildra Blueprints`,
    description: blueprint.description,
  };
}

export default async function BlueprintPage({ params }: BlueprintPageProps) {
  const { slug } = await params;
  const blueprint = getBlueprint(slug.join("/"));
  if (!blueprint) notFound();

  const gameScreens = getBlueprintsForGame(blueprint.game);
  const currentIndex = gameScreens.findIndex((item) => item.slug === blueprint.slug);
  const previous = gameScreens[(currentIndex - 1 + gameScreens.length) % gameScreens.length];
  const next = gameScreens[(currentIndex + 1) % gameScreens.length];

  return (
    <BlueprintViewer
      blueprint={blueprint}
      previousSlug={previous.slug}
      nextSlug={next.slug}
    />
  );
}
