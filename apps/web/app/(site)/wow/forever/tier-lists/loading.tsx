import { AtlasSkeleton } from '@/components/atlas';
import { ForeverFrame } from '@/components/wow/forever/ForeverFrame';
export default function Loading() { return <ForeverFrame lang="en"><AtlasSkeleton variant="rows" count={4} label="Loading tier lists"/></ForeverFrame>; }
