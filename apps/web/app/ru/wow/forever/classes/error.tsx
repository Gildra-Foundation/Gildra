"use client";
import { ForeverError } from '@/components/wow/forever/shared/ForeverError';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'ru';
export default function Error({ reset }: { reset: () => void }) { return <ForeverError lang={lang} page="classes" title={classesCopy[lang].classes} reset={reset} />; }
