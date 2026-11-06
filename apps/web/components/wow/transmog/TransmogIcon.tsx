"use client";

import { useState, type ReactNode } from "react";
import { iconUrls } from "@/lib/wow/transmog/model";

/** Item icon that falls back through iconUrls(), then to `fallback` (a slot outline) when none loads. */
export function TransmogIcon({ name, size, eager = false, fallback = null }: { name?: string; size: number; eager?: boolean; fallback?: ReactNode }) {
  return <IconImage key={name} name={name} size={size} eager={eager} fallback={fallback} />;
}

function IconImage({ name, size, eager, fallback }: { name?: string; size: number; eager: boolean; fallback: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const src = iconUrls(name)[attempt];
  if (!src) return <>{fallback}</>;
  return <img src={src} alt="" width={size} height={size} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setAttempt((value) => value + 1)} />;
}
