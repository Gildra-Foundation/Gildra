// Generated from app/(site)/wow/articles/page.tsx by npm run routes:mirror — edit the English page.
import { ArticlesIndexPage, articlesIndexMetadata } from "@/components/cms/Articles";

export const metadata = articlesIndexMetadata("ru");
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  return <ArticlesIndexPage lang="ru" page={page} />;
}
