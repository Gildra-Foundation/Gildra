import { ArticleView } from "@/components/cms/Articles";
import { articleFixture } from "@/components/cms/articleFixture";
import { assertGalleryEnabled } from "@/lib/blocks/gallery";

export const metadata = { title: "Article layout — Gildra dev", robots: { index: false, follow: false } };
// The dev flag is read per request (GILDRA_DEV_GALLERY), not baked in at build time.
export const dynamic = "force-dynamic";

/** Dev-only article page on a fixture that uses every editor block (`?lang=ru` for Russian). */
export default async function ArticleGallery({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  assertGalleryEnabled();
  const lang = (await searchParams).lang === "ru" ? "ru" : "en";
  return <ArticleView article={articleFixture(lang)} lang={lang} />;
}
