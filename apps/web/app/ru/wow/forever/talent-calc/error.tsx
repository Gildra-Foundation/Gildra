"use client";
import { ForeverTalentError } from "@/components/wow/forever/talents/ForeverTalentError";
export default function ErrorPage({ reset }: { reset: () => void }) { return <ForeverTalentError lang="ru" reset={reset} />; }
