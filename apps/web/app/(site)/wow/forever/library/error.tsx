"use client";
import { AtlasError } from "@gildra/atlas-ui/AtlasState";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { libraryCopy } from "@/components/wow/forever/library/libraryCopy";
export default function Error({reset}:{reset:()=>void}) { const t=libraryCopy.en; return <AtlasError title={t.error} actions={<AtlasButton onClick={reset}>{t.retry}</AtlasButton>} />; }
