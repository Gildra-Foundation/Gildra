// Generated from app/(site)/wow/articles/[slug]/page.tsx by npm run routes:mirror — edit the English page.
import { ArticleDetailPage, articleMetadata } from "@/components/cms/Articles";

// New CMS slugs render on first request; cached fetches are tagged for /api/cms/revalidate.
export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };
export const generateMetadata = async ({ params }: Props) => articleMetadata((await params).slug, "ru");
export default async function Page({ params }: Props) {
  return <ArticleDetailPage slug={(await params).slug} lang="ru" />;
}
