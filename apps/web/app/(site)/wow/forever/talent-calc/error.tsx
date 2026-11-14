"use client";
import { ForeverError } from "@/components/wow/forever/shared/ForeverError";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
export default function ErrorPage({ reset }: { reset: () => void }) { return <ForeverError lang="en" page="talents" title={talentCopy.en.title} reset={reset} />; }
