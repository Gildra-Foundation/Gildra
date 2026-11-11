import { TierListsPage, tierMetadata } from '@/components/wow/forever/tierLists/TierListsPage';
export const metadata = tierMetadata('ru');
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { const q=await searchParams;return <TierListsPage lang="ru" mode={typeof q.mode==='string'?q.mode:undefined} classSlug={typeof q.class==='string'?q.class:undefined}/>; }
