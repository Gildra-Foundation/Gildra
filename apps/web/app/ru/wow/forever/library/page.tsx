import { LibraryPage } from "@/components/wow/forever/library/LibraryPage";
import type { ForeverQuery } from "@/lib/forever/database/server";
export const dynamic = "force-dynamic";
const metadata = { title: "Библиотека Forever — WowArcana", robots: { index: true, follow: true } };
import { pairedAlternates } from "@/lib/seo/metadata";
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const query=await searchParams;return {...metadata,alternates:pairedAlternates("ru","/wow/forever/library"),robots:{index:Object.keys(query).length===0,follow:true}};
}
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
 const raw=await searchParams; const query: ForeverQuery={};
 for(const key of ["type","q","page","quality","category","minLevel","maxLevel","related","edge"] as const) if(typeof raw[key]==="string") query[key]=raw[key];
 return <LibraryPage lang="ru" query={query} />;
}
