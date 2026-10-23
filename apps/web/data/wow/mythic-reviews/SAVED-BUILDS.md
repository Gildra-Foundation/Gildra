# Saved Mythic talent builds

Named local library above the game import form, using existing genuine Atlas/Valyro
Input, Button and native Select. RU/EN, all dungeon maps, no account requirement.
Storage key gildra:mythic:saved-talent-builds has version1/builds[{id,name,code}].
Up to20entries,64name characters,4096export characters; raw storage bounded100k.
No metadata trusted: class/spec/role always comes from the strict import decoder.
Each switch revalidates against the current tree. Invalid/stale entries stay visible
with a fresh-export label; attempting to apply one preserves the active profile and
allows deleting the invalid entry. Same canonical code updates its name (dedup),
different allocations stay separate even within one spec. Deleting a saved entry
keeps the active import applied. Removing the active import/manual class/spec/role
changes do not erase the library. Existing single-import preferences stay intact.

Storage events sync the list and existing player-profile/role preferences across
tabs, locales and dungeons. Mutations re-read current storage before updating to
preserve previous sequential edits from another tab. This is a localStorage list,
not an atomic multi-writer database; exact simultaneous writes can still race.
If storage is blocked, an in-memory list remains usable in this tab with an explicit
message that it will not survive reload. Readable entries survive malformed siblings;
unsupported envelopes show a repair notice and empty list. Saving repairs the stored
envelope only as a result of the user's explicit Save action. No automatic writes
on render, no server storage, cookies, account or talent calculator changes.
