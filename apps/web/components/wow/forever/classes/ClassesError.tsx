"use client";
import { FOREVER_KIT } from './classesKit';
import { AtlasError } from '@gildra/atlas-ui/AtlasState';
import { MaterialButton, MaterialPlaque } from '@/components/wow/shared/materialAtlas';
import type { Lang } from '@/lib/i18n-paths';
import { classesCopy } from './classesCopy';
export function ClassesError({ lang, reset }: { lang: Lang; reset: () => void }) {
  const t = classesCopy[lang];
  return <MaterialPlaque kit={FOREVER_KIT}><AtlasError title={t.error} actions={<MaterialButton kit={FOREVER_KIT} onClick={reset}>{t.retry}</MaterialButton>} /></MaterialPlaque>;
}
