"use client";
import { ForeverError } from "@/components/wow/forever/shared/ForeverError";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
export default function Error({ reset }: { reset: () => void }) { return <ForeverError lang="en" page="library" title={libraryCopy.en.title} reset={reset} />; }
