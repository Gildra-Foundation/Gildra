import { notFound } from "next/navigation";
import { ArticlesListProto, type ListState, type ListVariant } from "@/components/cms/proto/ArticlesListProto";
import { parseArticleFilters } from "@/components/cms/articles/model";
import { assertGalleryEnabled } from "@/lib/blocks/gallery";

export const metadata = { title: "Articles list prototype — Gildra dev", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ variant: string; lang: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Design prototype of the articles list on demo topics: /dev/articles/{a|b|c}/{en|ru}?state=empty|loading&type=&class=&q=&page= */
export default async function ArticlesListPrototype({ params, searchParams }: { params: Params; searchParams: Search }) {
  assertGalleryEnabled();
  const { variant, lang } = await params;
  if (!["a", "b", "c"].includes(variant) || !["en", "ru"].includes(lang)) notFound();
  const raw = await searchParams;
  const state = (["empty", "loading"].includes(String(raw.state)) ? raw.state : "list") as ListState;
  return <ArticlesListProto variant={variant as ListVariant} lang={lang as "en" | "ru"} state={state} filters={parseArticleFilters(raw)} />;
}
