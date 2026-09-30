import type { Metadata } from "next";
import { getImageProps } from "next/image";
import { preload } from "react-dom";
import { BlueprintGallery } from "@/components/blueprints/BlueprintGallery";
import { blueprints } from "@/components/blueprints/catalog";

export const metadata: Metadata = {
  title: "Gildra Warcraft Blueprints — Tactical Interface Atlas",
  description: "Explore the Warcraft-first Gildra interface system for specializations, builds, encounters and party tactics.",
};

export default function BlueprintsPage() {
  preload("/assets/wow/mythic/ruby-depth-v3-light-fast.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(min-width: 769px)",
  });
  preload("/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(max-width: 768px)",
  });

  const imagePropsBySlug = Object.fromEntries(blueprints.map((blueprint) => [
    blueprint.slug,
    getImageProps({
      src: blueprint.asset,
      alt: `Preview of ${blueprint.title}`,
      fill: true,
      sizes: "(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 33vw",
      loading: "lazy",
      decoding: "async",
      fetchPriority: "low",
    }).props,
  ]));

  blueprints.filter((blueprint) => blueprint.game === "wow").slice(0, 1).forEach((blueprint) => {
    const imageProps = imagePropsBySlug[blueprint.slug];
    preload(imageProps.src, {
      as: "image",
      imageSrcSet: imageProps.srcSet,
      imageSizes: imageProps.sizes,
      fetchPriority: "high",
    });
  });

  return <BlueprintGallery imagePropsBySlug={imagePropsBySlug} />;
}
