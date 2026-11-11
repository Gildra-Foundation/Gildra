import { LibraryRecordPage } from "@/components/wow/forever/library/LibraryPage";
export const dynamic = "force-dynamic";
import { foreverRecord } from "@/lib/forever/database/server";
import { isForeverType, foreverRecordPath } from "@/lib/forever/database/contract";
import { pairedAlternates } from "@/lib/seo/metadata";
export async function generateMetadata({params}:{params:Promise<{type:string;id:string}>}) {
 const {type,id}=await params;
 if(!isForeverType(type)||!/^\d+$/.test(id))return {title:"Forever — WowArcana"};
 const record=await foreverRecord(type,Number(id));
 return record?{title:`${record.name.ru||record.name.en} — Forever — WowArcana`,alternates:pairedAlternates("ru",foreverRecordPath(type,Number(id)))}:{title:"Forever — WowArcana"};
}
export default async function Page({ params }: { params: Promise<{type:string;id:string}> }) {
 return <LibraryRecordPage lang="ru" {...await params} />;
}
