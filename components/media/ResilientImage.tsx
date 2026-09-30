"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: ReactNode;
};

/** Keeps stale catalog media from turning into the browser's broken-image glyph. */
export function ResilientImage({ src, fallback = null, onError, decoding = "async", ...props }: ResilientImageProps) {
  const normalizedSrc = normalizeMediaSrc(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    // An SSR image may fail before React hydrates and attaches `onError`.
    if (normalizedSrc && image?.complete && image.naturalWidth === 0) setFailedSrc(normalizedSrc);
  }, [normalizedSrc]);

  if (!normalizedSrc || failedSrc === normalizedSrc) return <>{fallback}</>;

  return (
    <img
      ref={imageRef}
      {...props}
      src={normalizedSrc}
      decoding={decoding}
      onError={(event) => {
        onError?.(event);
        setFailedSrc(normalizedSrc);
      }}
    />
  );
}

/** The frontend proxy owns media delivery and works for local/IP deployments too. */
export function normalizeMediaSrc(src?: string | null) {
  if (!src) return src;
  return src.replace(/^https:\/\/api\.gildra\.net(?=\/v1\/media\/)/, "");
}
