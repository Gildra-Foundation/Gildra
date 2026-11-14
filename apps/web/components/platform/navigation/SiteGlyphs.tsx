import { glyph, soft, solid } from "./CollectionGlyphs";
import type { NavigationIcon } from "./navigationMap";

/** Signs of the site's pages, tier-list modes and tabs: the same hand as the collection signs. */
export type SiteGlyph = ReturnType<typeof glyph>;

const helmet = "M12 2.8c-2.4 0-4 1.7-4 4v2.9l4 2.6 4-2.6V6.8c0-2.3-1.6-4-4-4z";
const shoulders = "M3 20.5v-3.4c0-2.6 2-4.6 4.6-4.6 1 0 1.9.3 2.6.9L12 15l1.8-1.6c.7-.6 1.6-.9 2.6-.9 2.6 0 4.6 2 4.6 4.6v3.4z";
const crest = "M12 2.5l7.5 2.6v5.9c0 4.7-3 8.3-7.5 10.5-4.5-2.2-7.5-5.8-7.5-10.5V5.1z";
const parchment = "M4 4.5h16V15l-5 5.5H4z";
const rise = "M3 18.5l5.2-6 3.8 3.2 3.8-5.5v10.3H3z";
const spark = "M18.6 2.6l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z";
const buckler = "M12 9.5l5.5 1.8v3.6c0 3-2 5.2-5.5 6.6-3.5-1.4-5.5-3.6-5.5-6.6v-3.6z";
const bowl = "M7 3.5h10v4.8c0 3-2.2 5.2-5 5.2s-5-2.2-5-5.2z";
const tome = "M5 5.5a2 2 0 0 1 2-2h12v17H7a2 2 0 0 1-2-2z";
const skull = "M12 6c-3.4 0-5.8 2.3-5.8 5.4 0 1.7.7 3.1 1.9 4v2.6c0 .8.7 1.5 1.5 1.5h4.8c.8 0 1.5-.7 1.5-1.5v-2.6c1.2-.9 1.9-2.3 1.9-4C17.8 8.3 15.4 6 12 6z";
const hornLeft = "M6.4 9.6C4 9 2.6 6.6 2.8 3.2c1.2 2 2.9 3.1 5.4 3.6";
const hornRight = "M17.6 9.6c2.4-.6 3.8-3 3.6-6.4-1.2 2-2.9 3.1-5.4 3.6";
const banner = "M6.5 5v14.5l5.5-3 5.5 3V5z";
const anvil = "M2.5 11.5H21V14h-3.5c-1.2 0-2 .8-2 2v1.5H18v3H7v-3h2.5V16c0-1.2-.6-2-1.8-2.3-2.5-.5-4.4-1.1-5.2-2.2z";
const mannequin = "M9.5 4.5h5l.3 1.5 3.7 1.7c.3 2-.4 3.6-1.9 4.8-.5 1.7 0 3.5 1.6 5.5H5.8c1.6-2 2.1-3.8 1.6-5.5-1.5-1.2-2.2-2.8-1.9-4.8L9.2 6z";
const leaning = "M21 20.5l-3.7-1L14 7l3.6.9z";
const pages = "M12 12.5c-2-1.4-4.7-1.8-8.5-1.3v8.5c3.8-.5 6.5-.1 8.5 1.3 2-1.4 4.7-1.8 8.5-1.3v-8.5c-3.8-.5-6.5-.1-8.5 1.3z";
const vane = "M21 3c-3.6.6-5.8 2.8-6 6.4l1.4 2.2c2.9-1.6 4.6-4.4 4.6-8.6z";
const keep = "M4 20.5v-16h3.5v3H10v-3h4v3h2.5v-3H20v16z";
const swordRight = "M20.5 3.5l-1 2.6-9.7 9.7-1.6-1.6 9.7-9.7z";
const swordLeft = "M3.5 3.5l1 2.6 9.7 9.7 1.6-1.6-9.7-9.7z";
const daggerLeft = "M10.4 3.2l.2 2.7-3.8 8.8-2.4-1 3.8-8.8z";
const daggerRight = "M13.6 3.2l-.2 2.7 3.8 8.8 2.4-1-3.8-8.8z";
const bolt = "M13.5 2.5L5 13.5h5.5l-1 8L19 10h-6z";
const keystone = "M12 2.5l7.5 9.5-7.5 9.5L4.5 12z";
const arch = "M4.5 20.5V11a7.5 7.5 0 0 1 15 0v9.5z";
const cog = "M10.2 5.4l.5-2.6h2.6l.5 2.6 1.6.7 2.2-1.5 1.8 1.8-1.5 2.2.7 1.6 2.6.5v2.6l-2.6.5-.7 1.6 1.5 2.2-1.8 1.8-2.2-1.5-1.6.7-.5 2.6h-2.6l-.5-2.6-1.6-.7-2.2 1.5-1.8-1.8 1.5-2.2-.7-1.6-2.6-.5v-2.6l2.6-.5.7-1.6-1.5-2.2 1.8-1.8 2.2 1.5z";
const sheet = "M6 7.5h12V17H6z";

const characters = glyph(<>
  <path d={shoulders} {...soft} />
  <path d={helmet} {...soft} />
  <path d={shoulders} />
  <path d={helmet} />
  <path d="M9.7 7.4h4.6M12 7.4v2.4" />
</>);

const classes = glyph(<>
  <path d={crest} {...soft} />
  <path d={crest} />
  <circle cx="12" cy="8" r="1.6" {...solid} />
  <circle cx="8.9" cy="12.8" r="1.6" {...solid} />
  <circle cx="15.1" cy="12.8" r="1.6" {...solid} />
</>);

const talents = glyph(<>
  <circle cx="5.5" cy="12" r="2.1" {...soft} />
  <circle cx="18.5" cy="19.5" r="2.1" {...soft} />
  <circle cx="5.5" cy="12" r="2.1" />
  <circle cx="18.5" cy="19.5" r="2.1" />
  <path d="M10.3 6.4L7.4 9.8M13.7 6.4l2.9 3.4M5.5 14.9v1.7M18.5 14.9v1.7" />
  <circle cx="12" cy="4.5" r="2.3" {...solid} />
  <circle cx="18.5" cy="12" r="2.3" {...solid} />
  <circle cx="5.5" cy="19.5" r="2.3" {...solid} />
</>);

const atlas = glyph(<>
  <path d={parchment} {...soft} />
  <path d={parchment} />
  <path d="M20 15h-5v5.5z" {...solid} />
  <path d="M8.2 14.8c.8-1.8 2-2.4 3.3-3 1.4-.7 2.3-1.3 2.8-2.3" strokeDasharray="1.6 2.4" />
  <path d="M14.3 6.9l2.4 2.4M16.7 6.9l-2.4 2.4" />
  <circle cx="7.6" cy="16.4" r="1.3" {...solid} />
</>);

const guide = glyph(<>
  <circle cx="12" cy="12" r="9" {...soft} />
  <circle cx="12" cy="12" r="9" />
  <path d="M12 5.8l1.9 4.3 4.3 1.9-4.3 1.9-1.9 4.3-1.9-4.3L5.8 12l4.3-1.9z" />
  <path d="M12 5.8l1.9 4.3h-3.8z" {...solid} />
</>);

const meta = glyph(<>
  <path d={rise} {...soft} />
  <path d="M3 18.5l5.2-6 3.8 3.2 3.8-5.5M3 20.5h12.8" />
  <path d={spark} {...solid} />
</>);

const comps = glyph(<>
  <path d={buckler} {...soft} />
  <path d="M4 2.5l2 1.1 2.4 3.9-1.7 1.1-2.5-3.8z" {...soft} />
  <path d={buckler} />
  <path d="M4 2.5l2 1.1 2.4 3.9-1.7 1.1-2.5-3.8zM5.6 9.3l3.8-2.5M7.6 8.1l1.2 1.9M15.2 10.5l3.4-5.4M12 12.9v5M9.5 15.4h5" />
  <circle cx="19.5" cy="3.7" r="1.7" {...solid} />
</>);

const stats = glyph(<>
  <path d="M4 20.5V13l2-2 2 2v7.5zM10 20.5v-15l2-2 2 2v15zM16 20.5v-11l2-2 2 2v11z" {...soft} />
  <path d="M4 20.5V13l2-2 2 2v7.5zM10 20.5v-15l2-2 2 2v15zM16 20.5v-11l2-2 2 2v11zM2.5 20.5h19" />
</>);

const leaderboard = glyph(<>
  <path d={bowl} {...soft} />
  <path d={bowl} />
  <path d="M7 5.5H4c0 3.2 1.4 5 3.6 5.3M17 5.5h3c0 3.2-1.4 5-3.6 5.3M12 13.5v3M9.5 16.5h5l1 4h-7zM7 20.5h10" />
  <path d="M12 5.9l1.9 2.3-1.9 2.3-1.9-2.3z" {...solid} />
</>);

const routes = glyph(<>
  <path d="M4.5 19.5H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.6" />
  <circle cx="4.5" cy="19.5" r="1.9" {...solid} />
  <circle cx="17.5" cy="16" r="1.9" {...solid} />
  <circle cx="6.5" cy="9" r="1.9" {...solid} />
  <path d="M19.3 2.9l2.6 2.6-2.6 2.6-2.6-2.6z" {...solid} />
</>);

const journal = glyph(<>
  <path d={tome} {...soft} />
  <path d={tome} />
  <path d="M5 18.5a2 2 0 0 1 2-2h12" />
  <path d="M12.5 5.8a3.1 3.1 0 0 0-3.1 3.1c0 1 .5 1.9 1.2 2.5v1.7h3.8v-1.7c.7-.6 1.2-1.5 1.2-2.5a3.1 3.1 0 0 0-3.1-3.1zM11.3 8.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zM13.7 8.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" fillRule="evenodd" {...solid} />
  <path d="M14.5 16.5v5l1.5-1.3 1.5 1.3v-5z" {...solid} />
</>);

const lairs = glyph(<>
  <path d={skull} {...soft} />
  <path d={hornLeft} {...soft} />
  <path d={hornRight} {...soft} />
  <path d={skull} />
  <path d={hornLeft} />
  <path d={hornRight} />
  <path d="M10.6 19.5v-1.8M13.4 19.5v-1.8" />
  <circle cx="9.7" cy="11.6" r="1.5" {...solid} />
  <circle cx="14.3" cy="11.6" r="1.5" {...solid} />
</>);

const raidComp = glyph(<>
  <path d={banner} {...soft} />
  <path d={banner} />
  <path d="M4.5 5h15M12 5V2.5" />
  <circle cx="10" cy="9" r="1.25" {...solid} />
  <circle cx="14" cy="9" r="1.25" {...solid} />
  <circle cx="10" cy="12.6" r="1.25" {...solid} />
  <circle cx="14" cy="12.6" r="1.25" {...solid} />
</>);

const auction = glyph(<>
  <circle cx="17.2" cy="6.7" r="4.2" {...soft} />
  <ellipse cx="8.8" cy="12.6" rx="5.6" ry="2.2" {...soft} />
  <circle cx="17.2" cy="6.7" r="4.2" />
  <ellipse cx="8.8" cy="12.6" rx="5.6" ry="2.2" />
  <path d="M3.2 12.6v5.8c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2v-5.8M3.2 15.6c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2" />
  <path d="M17.2 4.6l1.7 2.1-1.7 2.1-1.7-2.1z" {...solid} />
</>);

const professions = glyph(<>
  <path d={anvil} {...soft} />
  <path d={anvil} />
  <path d="M14.3 5.2L5.8 8.6" />
  <rect x="14.2" y="1.5" width="3.6" height="6" rx="0.9" transform="rotate(-22 16 4.5)" {...solid} />
</>);

const transmog = glyph(<>
  <path d={mannequin} {...soft} />
  <path d={mannequin} />
  <path d="M9.2 6l2.8 3.4L14.8 6M12 18v3.5M8.5 21.5h7M7.4 12.5h2.4M14.2 12.5h2.4" />
  <path d="M12 10.3l1.8 2.2-1.8 2.2-1.8-2.2z" {...solid} />
</>);

const library = glyph(<>
  <rect x="3.5" y="6.5" width="4.5" height="14" rx="0.8" {...soft} />
  <path d={leaning} {...soft} />
  <rect x="3.5" y="6.5" width="4.5" height="14" rx="0.8" />
  <rect x="8" y="3.5" width="4.5" height="17" rx="0.8" />
  <path d={leaning} />
  <path d="M3.5 10h4.5M2.5 20.5h19" />
  <rect x="8" y="13.5" width="4.5" height="3" {...solid} />
</>);

const stories = glyph(<>
  <path d={pages} {...soft} />
  <path d={pages} />
  <path d="M12 12.5V21M14.5 16.5L21 3" />
  <path d={vane} {...solid} />
</>);

const raid = glyph(<>
  <path d={keep} {...soft} />
  <path d={keep} />
  <path d="M9.5 20.5v-5a2.5 2.5 0 0 1 5 0v5z" {...solid} />
</>);

const arena = glyph(<>
  <path d={swordRight} {...soft} />
  <path d={swordLeft} {...soft} />
  <path d={swordRight} />
  <path d={swordLeft} />
  <path d="M6.6 12.6l4.8 4.8M9 15l-3.2 3.2M17.4 12.6l-4.8 4.8M15 15l3.2 3.2" />
  <circle cx="4.9" cy="19.1" r="1.4" {...solid} />
  <circle cx="19.1" cy="19.1" r="1.4" {...solid} />
</>);

const duel = glyph(<>
  <path d={daggerLeft} {...soft} />
  <path d={daggerRight} {...soft} />
  <path d={daggerLeft} />
  <path d={daggerRight} />
  <path d="M3 13.1l5.2 2.2M5.6 14.2l-1.3 3M21 13.1l-5.2 2.2M18.4 14.2l1.3 3" />
  <circle cx="3.8" cy="18.4" r="1.4" {...solid} />
  <circle cx="20.2" cy="18.4" r="1.4" {...solid} />
  <path d="M12 11.2l.8 1.5 1.5.8-1.5.8-.8 1.5-.8-1.5-1.5-.8 1.5-.8z" {...solid} />
</>);

const shuffle = glyph(<>
  <path d="M3 7.5h3c2.6 0 4 1.5 5.5 4.5s2.9 4.5 5.5 4.5h1.2M3 16.5h3c1.5 0 2.6-.5 3.6-1.6M13.9 9.1c1-1.1 2.1-1.6 3.6-1.6h.7" />
  <path d="M18.2 13.8l3.3 2.7-3.3 2.7zM18.2 4.8l3.3 2.7-3.3 2.7z" {...solid} />
</>);

const blitz = glyph(<>
  <path d={bolt} {...soft} />
  <path d={bolt} />
  <path d="M5.5 3.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7L3 6l1.7-.8zM18.5 15l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" {...solid} />
</>);

const mythic = glyph(<>
  <path d={keystone} {...soft} />
  <path d={keystone} />
  <circle cx="12" cy="8.4" r="1.9" />
  <path d="M12 10.3v6.2M12 13.6h2.2M12 16.3h1.8" />
</>);

const dungeon = glyph(<>
  <path d={arch} {...soft} />
  <path d={arch} />
  <path d="M9 20.5v-8.7a3 3 0 0 1 6 0v8.7z" {...solid} />
  <path d="M2.5 20.5h19" />
</>);

const tools = glyph(<>
  <path d={cog} {...soft} />
  <path d={cog} />
  <circle cx="12" cy="12" r="2.6" {...solid} />
</>);

/** «What's new»: the page's sign on the home page and the tab's sign in the bar. */
export const whatsNewGlyph = glyph(<>
  <path d={sheet} {...soft} />
  <path d="M5 3.5h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4zM5 17h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4zM6 7.5V17M18 7.5V17M9 10.6h6M9 13.6h2.5" />
  <circle cx="15" cy="13.8" r="1.8" {...solid} />
</>);

export const pageGlyphs: Record<NavigationIcon, SiteGlyph> = {
  characters, classes,
  atlas, guide, meta, comps, stats, leaderboard, routes,
  journal, lairs, raidComp,
  auction, professions, transmog,
  library, stories,
};

export const modeGlyphs = { raid, arena, duel, shuffle, blitz };

/** Tabs of the bar by realm id: a tab wears the sign of its subject. */
export const realmGlyphs: Record<string, SiteGlyph> = {
  heroes: characters, classes, mythic, raids: raid, meta, library, chronicle: whatsNewGlyph, tools,
  "forever-library": library, "forever-talent-calc": talents, "forever-classes": classes, "forever-professions": professions,
  "forever-tier-lists": meta, "forever-dungeons": dungeon, "forever-raids": raid,
};
