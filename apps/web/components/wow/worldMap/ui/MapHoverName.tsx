"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "../worldMapViewer.module.css";

/**
 * The name of the zone under the pointer, as the game shows it: a small
 * plaque that follows the cursor while the zone glows. Mouse and pen only.
 */
export function MapHoverName({ surface, name }: { surface: RefObject<HTMLElement | null>; name: string | null }) {
  const plaque = useRef<HTMLDivElement>(null);
  const last = useRef<[number, number] | null>(null);

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    // Hidden until the pointer moves over the art.
    plaque.current?.setAttribute("data-over", "");
    let frame = 0;
    const place = () => {
      frame = 0;
      const box = plaque.current, at = last.current;
      if (!box || !at) return;
      const rect = el.getBoundingClientRect();
      // Off the cursor to the lower right; flipped near the edges.
      const w = box.offsetWidth, h = box.offsetHeight;
      const x = at[0] + 18 + w > rect.width - 8 ? at[0] - 14 - w : at[0] + 18;
      const y = at[1] + 22 + h > rect.height - 8 ? at[1] - 12 - h : at[1] + 22;
      box.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") { last.current = null; return; }
      // Over a label or a panel the name is already on screen.
      const over = Boolean((event.target as HTMLElement | null)?.closest?.("[data-map-ui]"));
      if (plaque.current) plaque.current.toggleAttribute("data-over", over);
      const rect = el.getBoundingClientRect();
      last.current = [event.clientX - rect.left, event.clientY - rect.top];
      if (!frame) frame = requestAnimationFrame(place);
    };
    const leave = () => { last.current = null; plaque.current?.toggleAttribute("data-over", true); };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); if (frame) cancelAnimationFrame(frame); };
  }, [surface]);

  useEffect(() => {
    // A new name: put it at the cursor at once (not where the last one was).
    if (!name || !plaque.current || !last.current) return;
    const at = last.current;
    plaque.current.style.transform = `translate3d(${Math.round(at[0] + 18)}px, ${Math.round(at[1] + 22)}px, 0)`;
  }, [name]);

  return (
    <div ref={plaque} className={styles.hoverName} aria-hidden="true" data-shown={name ? "" : undefined}>
      {name}
    </div>
  );
}
