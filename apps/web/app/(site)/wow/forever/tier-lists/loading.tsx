import { ForeverLoading } from '@/components/wow/forever/shared/ForeverLoading';
import { copy } from '@/components/wow/forever/tierLists/tierListsCopy';
const lang = 'en';
export default function Loading() { return <ForeverLoading lang={lang} page="tierLists" title={copy[lang].title} variant="rows" count={4} />; }
