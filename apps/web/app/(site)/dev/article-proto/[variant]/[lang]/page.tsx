import { notFound } from "next/navigation";
import { ArticleProto, type ArticleVariant } from "@/components/cms/proto/ArticleProto";
import { assertGalleryEnabled } from "@/lib/blocks/gallery";

export const metadata = { title: "Article prototype — Gildra dev", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Design prototype of the article page: /dev/article-proto/{1|2}/{en|ru} */
export default async function ArticlePrototype({ params }: { params: Promise<{ variant: string; lang: string }> }) {
  assertGalleryEnabled();
  const { variant, lang } = await params;
  if (!["1", "2"].includes(variant) || !["en", "ru"].includes(lang)) notFound();
  return <ArticleProto variant={variant as ArticleVariant} lang={lang as "en" | "ru"} />;
}
