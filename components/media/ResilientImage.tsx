"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: ReactNode;
};

/** Keeps stale catalog media from turning into the browser's broken-image glyph. */
export function ResilientImage({ src, fallback = null, onError, decoding = "async", ...props }: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <>{fallback}</>;

  return <img {...props} src={src} decoding={decoding} onError={(event) => { onError?.(event); setFailed(true); }} />;
}
