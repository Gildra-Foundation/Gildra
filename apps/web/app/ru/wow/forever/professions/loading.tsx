import { AtlasSkeleton } from '@/components/atlas';
import { ForeverFrame } from '@/components/wow/forever/ForeverFrame';
export default function Loading() {return <ForeverFrame lang="ru"><AtlasSkeleton variant="rows" count={5} label="Загрузка профессий"/></ForeverFrame>;}
