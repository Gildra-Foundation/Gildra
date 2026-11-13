"use client";
import { ForeverError } from '@/components/wow/forever/shared/ForeverError';
import { copy } from '@/components/wow/forever/tierLists/tierListsCopy';
const lang = 'en';
export default function Error({ reset }: { reset: () => void }) { return <ForeverError lang={lang} page="tierLists" title={copy[lang].title} reset={reset} />; }
