import { FOREVER_KIT } from './classesKit';
import { AtlasHero, AtlasSkeleton } from '@/components/atlas';
import { MaterialPlaque } from '@/components/wow/shared/materialAtlas';
import { ForeverFrame } from '../ForeverFrame';
import type { Lang } from '@/lib/i18n-paths';
import { classesCopy } from './classesCopy';
export function ClassesLoading({ lang }: { lang: Lang }) {
  const t = classesCopy[lang];
  return <ForeverFrame lang={lang}><AtlasHero title={t.classes} /><MaterialPlaque kit={FOREVER_KIT}><AtlasSkeleton variant="rows" count={4} label={t.loading} /></MaterialPlaque></ForeverFrame>;
}
