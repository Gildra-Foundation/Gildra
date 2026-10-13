"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeMediaSrc, ResilientImage } from "./ResilientImage";

type Props = {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  quality?: 75 | 90;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  fallback?: ReactNode;
};

/** Optimizes first-party media while retaining the existing broken-asset fallback. */
export function OptimizedResilientImage({
  src,
  alt,
  width,
  height,
  sizes,
  quality = 75,
  loading = "lazy",
  fetchPriority,
  fallback = null,
}: Props) {
  const normalized = normalizeMediaSrc(src);
  const [failedSrc, setFailedSrc] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (normalized && image?.complete && image.naturalWidth === 0) setFailedSrc(normalized);
  }, [normalized]);

  if (!normalized || failedSrc === normalized) return <>{fallback}</>;
  if (!normalized.startsWith("/")) {
    return <ResilientImage src={normalized} alt={alt} width={width} height={height} loading={loading} fallback={fallback} />;
  }

  return <Image
    src={normalized}
    ref={imageRef}
    alt={alt}
    width={width}
    height={height}
    sizes={sizes}
    quality={quality}
    loading={loading}
    fetchPriority={fetchPriority}
    onError={() => setFailedSrc(normalized)}
  />;
}
