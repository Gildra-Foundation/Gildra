import { ForeverLoading } from '@/components/wow/forever/shared/ForeverLoading';
import { copy } from '@/components/wow/forever/professions/copy';
export default function Loading() { return <ForeverLoading lang="ru" page="professions" title={copy.ru.title} variant="rows" count={6} />; }
