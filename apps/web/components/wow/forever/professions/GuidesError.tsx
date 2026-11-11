'use client';
import { AtlasHero } from '@gildra/atlas-ui/AtlasHero';
import { MaterialButton } from '@/components/wow/shared/materialAtlas';
import { ForeverFrame } from '../ForeverFrame';
import { FOREVER_KIT } from './kit';
import { copy } from './copy';
export function GuidesError({lang,reset}:{lang:'en'|'ru';reset:()=>void}) {
 const c=copy[lang];
 return <ForeverFrame lang={lang}><AtlasHero title={c.error}/><div role="alert"><MaterialButton kit={FOREVER_KIT} onClick={reset}>{c.retry}</MaterialButton></div></ForeverFrame>;
}
