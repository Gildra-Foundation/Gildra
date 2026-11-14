import { ForeverLoading } from "@/components/wow/forever/shared/ForeverLoading";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
export default function Loading() { return <ForeverLoading lang="ru" page="library" title={libraryCopy.ru.title} variant="cards" count={12} />; }
