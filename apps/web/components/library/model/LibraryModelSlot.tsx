import "server-only";
import type { ReactNode } from "react";
import modelIndex from "./modelIndex.json";
import { LibraryModelViewer, type LibraryModelSubject } from "./LibraryModelViewer";
import { libraryModelCopy } from "./libraryModelCopy";

type Props = { dataset: string; type: string; id: string; externalId: number; name: string; lang: "en" | "ru" };

const index = modelIndex as unknown as { mounts: Record<string, number[]>; sets: Record<string, Array<[number, number]>> };

/** Resolved 3D subject of a library record, or null when the record has no model. */
export function libraryModelSubject(dataset: string, externalId: number): LibraryModelSubject | null {
  const key = String(externalId);
  if (dataset === "mounts") {
    const displays = index.mounts[key];
    return displays?.length ? { kind: "mount", displays } : null;
  }
  if (dataset === "transmog-sets") {
    const items = index.sets[key];
    return items?.length ? { kind: "set", items } : null;
  }
  return null;
}

/**
 * 3D slot of a library record page. Returns null when there is no model, so
 * the page omits the slot entirely. The viewer fills its parent; the frame,
 * caption and placement belong to the page.
 */
export async function LibraryModelSlot({ dataset, externalId, name, lang }: Props): Promise<ReactNode | null> {
  const subject = libraryModelSubject(dataset, externalId);
  if (!subject) return null;
  const fallbackImage = subject.kind === "mount"
    ? `https://render.worldofwarcraft.com/us/npcs/zoom/creature-display-${subject.displays[0]}.jpg`
    : undefined;
  // A player mannequin is 32–36 MB on first view (cached afterwards): load it on request.
  const heavy = subject.kind === "set";
  const loadHint = heavy ? libraryModelCopy[lang].setLoadHint : undefined;
  return <LibraryModelViewer subject={subject} name={name} lang={lang} fallbackImage={fallbackImage} autoLoad={!heavy} loadHint={loadHint} />;
}
