import { ForeverLoading } from '@/components/wow/forever/shared/ForeverLoading';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'ru';
export default function Loading() { return <ForeverLoading lang={lang} page="changes" title={classesCopy[lang].changes} variant="rows" count={8} />; }
