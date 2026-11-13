"use client";
import { ForeverError } from '@/components/wow/forever/shared/ForeverError';
import { copy } from '@/components/wow/forever/professions/copy';
export default function ErrorPage({ reset }: { reset: () => void }) { return <ForeverError lang="en" page="professions" title={copy.en.title} reset={reset} />; }
