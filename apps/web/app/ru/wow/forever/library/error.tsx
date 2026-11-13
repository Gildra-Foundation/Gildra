"use client";
import { ForeverError } from "@/components/wow/forever/shared/ForeverError";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
export default function Error({ reset }: { reset: () => void }) { return <ForeverError lang="ru" page="library" title={libraryCopy.ru.title} reset={reset} />; }
