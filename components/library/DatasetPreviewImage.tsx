"use client";

import { useState } from "react";

export function DatasetPreviewImage({ src, iconSymbol }: { src?: string; iconSymbol: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <svg className="i"><use href={iconSymbol} /></svg>;
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
