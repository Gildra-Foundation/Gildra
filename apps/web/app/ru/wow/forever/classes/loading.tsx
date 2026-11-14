import { ForeverLoading } from '@/components/wow/forever/shared/ForeverLoading';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'ru';
export default function Loading() { return <ForeverLoading lang={lang} page="classes" title={classesCopy[lang].classes} variant="cards" count={9} />; }
