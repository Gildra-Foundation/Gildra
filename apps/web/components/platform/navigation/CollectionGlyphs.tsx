import type { ReactNode } from "react";

/** Signs of the library collections, drawn for the menu: one stroke weight, a soft fill for the body. */
export type GlyphProps = { size?: number; strokeWidth?: number; className?: string };
export const soft = { fill: "currentColor", fillOpacity: 0.16, stroke: "none" } as const;
export const solid = { fill: "currentColor", fillOpacity: 0.9, stroke: "none" } as const;

/** One drawn sign: a 24 × 24 grid, the line weight is the set's own (a `strokeWidth` passed in is ignored). */
export function glyph(body: ReactNode) {
  return function Glyph({ size = 20, className }: GlyphProps) {
    return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{body}</svg>;
  };
}

const chest = "M3.5 11h17v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z";
const blade = "M20.5 3.5l-.6 4.2-8.6 8.6-3.6-3.6 8.6-8.6z";
const helm = "M12 3C7.6 3 5 6.4 5 11v7.4L9.5 21v-6.2h5V21l4.5-2.6V11c0-4.6-2.6-8-7-8z";
const gem = "M7 3.5h10l4.5 5.8L12 21 2.5 9.3z";
const star = "M16.5 2.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z";
const steed = "M7 21c.4-3.4 2.6-5.6 4.6-8.3-.9.3-1.8.2-2.7-.3l-1.3 1.3c-.4.4-1 .6-1.6.5l-1.7-.4c-.8-.2-1.2-1.1-.8-1.8l2.9-4.5c.1-1.9 1.1-3.5 2.8-4.5l.6 2L11.5 3c3.5.2 6 2.5 6 5.5 0 2.1-.9 4.1-2.7 5.5 1.4 1.8 2.2 4 2.2 7z";
const pad = "M12 11.5c2.6 0 5.5 3.3 5.5 6 0 1.9-1.4 3-3 3-1 0-1.6-.5-2.5-.5s-1.5.5-2.5.5c-1.6 0-3-1.1-3-3 0-2.7 2.9-6 5.5-6z";
const top = "M4.5 10c0-1.9 3.4-3.5 7.5-3.5s7.5 1.6 7.5 3.5c0 3.8-5 6.4-7.5 11-2.5-4.6-7.5-7.2-7.5-11z";

export const collectionGlyphs = {
  items: glyph(<>
    <path d={chest} {...soft} />
    <path d="M3.5 11V9.5A5.5 5.5 0 0 1 9 4h6a5.5 5.5 0 0 1 5.5 5.5V11" />
    <path d={chest} />
    <rect x="10.25" y="9" width="3.5" height="4.5" rx="1" {...solid} />
  </>),
  weapons: glyph(<>
    <path d={blade} {...soft} />
    <path d={blade} />
    <path d="M19.5 4.5l-9 9M5.2 11.2l7.6 7.6M8.6 15.4l-3.9 3.9" />
    <circle cx="3.9" cy="20.1" r="1.4" {...solid} />
  </>),
  armor: glyph(<>
    <path d={helm} {...soft} />
    <path d={helm} />
    <path d="M8.2 11.2h7.6M12 11.2v3.6M12 3v4.2" />
  </>),
  gems: glyph(<>
    <path d={gem} {...soft} />
    <path d={gem} />
    <path d="M2.5 9.3h19M7 3.5l1.8 5.8L12 21l3.2-11.7L17 3.5M12 3.5L8.8 9.3M12 3.5l3.2 5.8" />
  </>),
  spells: glyph(<>
    <path d="M3.5 20.5l9.2-9.2M5.2 21.6l-2.8-2.8" />
    <path d={star} {...solid} />
    <path d={star} />
    <path d="M7 5.5v3M5.5 7h3M19 16v3M17.5 17.5h3" />
  </>),
  mounts: glyph(<>
    <path d={steed} {...soft} />
    <path d={steed} />
    <path d="M10.3 8.2h.01" strokeWidth={2.2} />
  </>),
  pets: glyph(<>
    <path d={pad} {...solid} />
    <ellipse cx="5" cy="10.5" rx="1.9" ry="2.4" transform="rotate(-20 5 10.5)" {...solid} />
    <ellipse cx="9.3" cy="5.8" rx="2" ry="2.6" transform="rotate(-8 9.3 5.8)" {...solid} />
    <ellipse cx="14.7" cy="5.8" rx="2" ry="2.6" transform="rotate(8 14.7 5.8)" {...solid} />
    <ellipse cx="19" cy="10.5" rx="1.9" ry="2.4" transform="rotate(20 19 10.5)" {...solid} />
  </>),
  toys: glyph(<>
    <path d={top} {...soft} />
    <path d={top} />
    <path d="M4.5 10c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3M12 6.5v-4M10 2.5h4M7.2 14.6c1.4.6 3 .9 4.8.9s3.4-.3 4.8-.9" />
  </>),
};
