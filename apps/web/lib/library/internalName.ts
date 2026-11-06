/**
 * Client-internal records that the game never shows to a player (do-not-translate
 * placeholders, conversation pings, race-timer bookkeeping). They stay reachable
 * by address; lists, suggestions, related records and tooltip lines leave them out.
 */
export const LIBRARY_INTERNAL_NAME = /\bDNT\b|\[PH\]|^Ping\b|Personal Best Record|^zz|\bdeprecated\b|\bunused\b/i;
