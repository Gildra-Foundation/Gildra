import { NextResponse } from "next/server";
import { assertGalleryEnabled, galleryBlockTypes } from "@/lib/blocks/gallery";

/** JSON list of registered block types — consumed by `design:capture -- --blocks`. */
export function GET() {
  assertGalleryEnabled();
  return NextResponse.json({ blocks: galleryBlockTypes() });
}
