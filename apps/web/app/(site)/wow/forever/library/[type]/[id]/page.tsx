import { LibraryRecordPage } from "@/components/wow/forever/library/LibraryPage";
export const dynamic = "force-dynamic";
import { foreverRecordMetadata } from "@/lib/forever/database/metadata";
export const generateMetadata = ({ params }: { params: Promise<{ type: string; id: string }> }) => foreverRecordMetadata("en", params);
export default async function Page({ params }: { params: Promise<{type:string;id:string}> }) {
 return <LibraryRecordPage lang="en" {...await params} />;
}
