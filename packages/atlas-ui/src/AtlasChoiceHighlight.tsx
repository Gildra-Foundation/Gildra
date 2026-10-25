"use client";

import type { RefObject } from "react";
import { useSlidingIndicator } from "./valyro-ui/navigation/internal";

/** Valyro's measured selection thumb for existing native choice buttons. */
export function AtlasChoiceHighlight({ listRef, activeKey, selector, className, name, visible = true }: {
  listRef: RefObject<HTMLElement | null>;
  activeKey: unknown;
  selector: string;
  className: string;
  name: string;
  visible?: boolean;
}) {
  const rect = useSlidingIndicator(listRef, activeKey, selector);
  return rect && <span aria-hidden="true" className={className} data-choice-highlight={name} data-visible={visible} style={{
    width: rect.width, height: rect.height,
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    transition: rect.instant ? "none" : undefined,
  }} />;
}
