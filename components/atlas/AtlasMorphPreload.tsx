"use client";

import { useEffect, useRef } from "react";
import { getImageProps } from "next/image";

const warmed = new Set<string>();

/**
 * Warms the opened page's scene while the reader points at (or focuses) a card
 * that morphs into it, so the picture lands on a loaded painting. Same props as
 * AtlasFrame's art (fill, 100vw, quality 50), hence the very same image URL.
 * Fine pointers only; nothing on touch, data saving or slow connections.
 */
export function AtlasMorphPreload({ art }: { art: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = marker.current?.closest("a, article, li");
    if (!target || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /2g/.test(connection?.effectiveType ?? "")) return;
    const warm = () => {
      if (warmed.has(art)) return;
      warmed.add(art);
      const { props } = getImageProps({ src: art, alt: "", fill: true, sizes: "100vw", quality: 50 });
      const image = new Image();
      image.decoding = "async";
      image.sizes = props.sizes ?? "100vw";
      if (props.srcSet) image.srcset = props.srcSet;
      image.src = props.src;
    };
    target.addEventListener("pointerenter", warm, { once: true });
    target.addEventListener("focusin", warm, { once: true });
    return () => {
      target.removeEventListener("pointerenter", warm);
      target.removeEventListener("focusin", warm);
    };
  }, [art]);
  return <span ref={marker} hidden />;
}
