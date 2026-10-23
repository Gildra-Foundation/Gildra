// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { ArticlesIndexPage, articlesIndexMetadata } from "@/components/cms/Articles";
import { parseArticleFilters } from "@/components/cms/articles/model";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const generateMetadata = async ({ searchParams }: Props) => articlesIndexMetadata("en", parseArticleFilters(await searchParams));
export default async function Page({ searchParams }: Props) {
  return <ArticlesIndexPage lang="en" filters={parseArticleFilters(await searchParams)} />;
}
