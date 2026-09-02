import "server-only";
import { notFound } from "next/navigation";
import { registry } from "./registry";
import type { BlockType } from "./page";

/** The block gallery is a dev tool: hidden in production unless explicitly enabled. */
export function assertGalleryEnabled() {
  if (process.env.NODE_ENV === "production" && process.env.GILDRA_DEV_GALLERY !== "1") {
    notFound();
  }
}

export const galleryBlockTypes = () => Object.keys(registry) as BlockType[];

export const isBlockType = (type: string): type is BlockType => type in registry;

/** Viewports the gallery renders each block at (design.md §I QA matrix subset). */
export const GALLERY_WIDTHS = [1440, 768, 390] as const;
