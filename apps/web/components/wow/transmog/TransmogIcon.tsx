"use client";

import { useState, type ReactNode } from "react";
import { iconUrls } from "@/lib/wow/transmog/model";

/**
 * Icon of an item (or of a set): its file by name, then the item's own icon
 * from Blizzard, then `fallback` (the slot outline) when none loads.
 */
export function TransmogIcon({ name, itemId, setId, size, eager = false, fallback = null }: {
  name?: string; itemId?: number; setId?: number; size: number; eager?: boolean; fallback?: ReactNode;
}) {
  return <IconImage key={`${name}|${itemId ?? ""}|${setId ?? ""}`} urls={iconUrls(name, { itemId, setId })} size={size} eager={eager} fallback={fallback} />;
}

function IconImage({ urls, size, eager, fallback }: { urls: string[]; size: number; eager: boolean; fallback: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const src = urls[attempt];
  if (!src) return <>{fallback}</>;
  return <img src={src} alt="" width={size} height={size} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setAttempt((value) => value + 1)} />;
}
