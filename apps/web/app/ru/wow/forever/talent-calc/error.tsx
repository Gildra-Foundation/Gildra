"use client";
import { ForeverError } from "@/components/wow/forever/shared/ForeverError";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
export default function ErrorPage({ reset }: { reset: () => void }) { return <ForeverError lang="ru" page="talents" title={talentCopy.ru.title} reset={reset} />; }
