"use client";

import { useState } from "react";
import { iconUrls } from "@/lib/wow/transmog/model";

/** Item icon that falls back through iconUrls() and disappears when none loads. */
export function TransmogIcon({ name, size, eager = false }: { name?: string; size: number; eager?: boolean }) {
  return <IconImage key={name} name={name} size={size} eager={eager} />;
}

function IconImage({ name, size, eager }: { name?: string; size: number; eager: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const src = iconUrls(name)[attempt];
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setAttempt((value) => value + 1)} />;
}
