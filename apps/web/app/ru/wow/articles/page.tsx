// Generated from app/(site)/wow/articles/page.tsx by npm run routes:mirror — edit the English page.
import { ArticlesIndexPage, articlesIndexMetadata } from "@/components/cms/Articles";
import { parseArticleFilters } from "@/components/cms/articles/model";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const generateMetadata = async ({ searchParams }: Props) => articlesIndexMetadata("ru", parseArticleFilters(await searchParams));
export default async function Page({ searchParams }: Props) {
  return <ArticlesIndexPage lang="ru" filters={parseArticleFilters(await searchParams)} />;
}
