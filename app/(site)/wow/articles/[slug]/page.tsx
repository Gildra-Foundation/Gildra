// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { ArticleDetailPage, articleMetadata } from "@/components/cms/Articles";

// New CMS slugs render on first request; cached fetches are tagged for /api/cms/revalidate.
export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };
export const generateMetadata = async ({ params }: Props) => articleMetadata((await params).slug, "en");
export default async function Page({ params }: Props) {
  return <ArticleDetailPage slug={(await params).slug} lang="en" />;
}
