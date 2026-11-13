'use client';
import { ForeverError } from '../shared/ForeverError';
/** Kept for the tier lists' error page, which still imports it; the professions pages use ForeverError directly. */
export function GuidesError({ lang, reset }: { lang: 'en' | 'ru'; reset: () => void }) {
  return <ForeverError lang={lang} page="hub" title="Forever" reset={reset} />;
}
