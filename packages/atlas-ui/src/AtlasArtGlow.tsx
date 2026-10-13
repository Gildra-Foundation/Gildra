"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./AtlasArtGlow.module.css";

export type ArtGlowPoint = {
  /** Point of the painting, 0–1 of its natural width and height. */
  at: readonly [number, number];
  /** Radius of the glow in image pixels. */
  radius: number;
  /** Colour of the light (any CSS colour). */
  color: string;
  /** Seconds per breath (default 4). */
  tempo?: number;
};

/**
 * Living light on fixed points of a scene painting (roadmap item 44): lava that
 * breathes, a crystal that pulses. Placed with the same cover-crop maths as
 * object-fit, so the light stays on its spot at every width. Rendered in
 * AtlasFrame's art layer from the scene registry (`glow`); hidden under reduced
 * motion and the site's "less motion" switch.
 */
export function AtlasArtGlow({ imageSize, focus, points }: { imageSize: readonly [number, number]; focus: readonly [number, number]; points: readonly ArtGlowPoint[] }) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = layer.current;
    const box = element?.parentElement;
    if (!element || !box) return;
    const place = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      const scale = Math.max(width / imageSize[0], height / imageSize[1]);
      const offsetX = (width - imageSize[0] * scale) * focus[0];
      const offsetY = (height - imageSize[1] * scale) * focus[1];
      element.querySelectorAll<HTMLElement>("[data-glow]").forEach((spot, index) => {
        const point = points[index];
        const size = point.radius * 2 * scale;
        spot.style.width = `${size}px`;
        spot.style.height = `${size}px`;
        spot.style.left = `${offsetX + point.at[0] * imageSize[0] * scale - size / 2}px`;
        spot.style.top = `${offsetY + point.at[1] * imageSize[1] * scale - size / 2}px`;
      });
      element.dataset.placed = "";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [imageSize, focus, points]);
  return (
    <div ref={layer} className={styles.layer} aria-hidden="true" data-motion-layer>
      {points.map((point, index) => (
        <span key={index} data-glow className={styles.glow} style={{ "--glow-color": point.color, "--glow-tempo": `${point.tempo ?? 4}s`, animationDelay: `${index * -1.3}s` } as CSSProperties} />
      ))}
    </div>
  );
}
