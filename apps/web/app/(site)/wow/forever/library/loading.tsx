import { ForeverLoading } from "@/components/wow/forever/shared/ForeverLoading";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
export default function Loading() { return <ForeverLoading lang="en" page="library" title={libraryCopy.en.title} variant="cards" count={12} />; }
