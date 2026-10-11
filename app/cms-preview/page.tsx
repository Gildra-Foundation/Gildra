import { ArticlePreviewPage, previewMetadata } from "@/components/cms/ArticlePreview";

export const dynamic = "force-dynamic";
export const metadata = previewMetadata;
type Props = { searchParams: Promise<{ token?: string | string[] }> };
export default async function Page({ searchParams }: Props) {
  return <ArticlePreviewPage lang="en" token={(await searchParams).token} />;
}
