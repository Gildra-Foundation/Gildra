import { ReaderPage, readerMetadata } from "@/components/cms/ReaderPage";

export const dynamic = "force-dynamic";
export const metadata = readerMetadata;
export default function Page() {
  return <ReaderPage lang="ru" mode="account" />;
}
