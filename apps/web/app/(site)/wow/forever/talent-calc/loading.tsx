import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
export default function Loading() { return <AtlasSkeleton variant="rows" count={7} label={talentCopy.en.loading} />; }
