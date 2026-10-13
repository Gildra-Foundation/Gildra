// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { ArticlesIndexPage, articlesIndexMetadata } from "@/components/cms/Articles";

export const metadata = articlesIndexMetadata("en");
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  return <ArticlesIndexPage lang="en" page={page} />;
}
