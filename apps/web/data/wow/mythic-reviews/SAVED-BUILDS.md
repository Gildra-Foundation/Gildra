# Saved Mythic talent builds

## Sharing a snapshot

Choose a saved build and use Share build. The URL fragment contains only version1,
the build name and canonical talent export. No owner/account/library ID or access
credential is included. It is a copy: later source rename/deletion does not revoke
or edit existing links. Fragments do not enter HTTP requests to the page server.
Clipboard denial leaves a labelled read-only link for manual copy.

Recipients can open and explicitly apply advice without signing in. Save to my
account requires a verified session and an explicit click; the usual revision,
account-switch, capacity and decoder guards remain. Sign-in returns to the complete
same-origin shared URL, including its fragment; no auto-save follows login. An
existing identical export is identified without renaming the recipient's build.
Malformed/oversized/unknown-version/outdated payloads show an error and never alter
the current import/library. Received names render as ordinary escaped React text.

## Account library

RU/EN My builds above every dungeon map, using the existing Atlas/Valyro Input,
Button and native Select. Strict talent decoder and ability filtering unchanged.
Up to20builds/account, names64UTF16units, exports4096ASCIIcharacters. Guest mode
retains the existing version1 localStorage library. Current imported code/class/role
remain device preferences, separately from the saved account library.

Signed-in persistence: /api/wow/mythic-builds BFF reads the server Auth.js session;
access tokens never enter the build client or its response. Same-origin mutations,
private/no-store/VaryCookie, bounded streamed request bodies and explicit route/body
allowlists. Proxy validates current talent exports and canonicalizes them. Backend
/v1/wow/mythic-builds uses the existing real Battle.net userinfo verifier to derive
ownership, never a supplied account ID. Server account key is a consistency guard,
not authorization; a stale key rejects a write after a shared-browser account switch.
Account name comes from the signed session. Account lists are kept only in memory,
cleared on auth refresh/unmount, never copied into guest localStorage.

PostgreSQL migration173 is additive: wow_mythic_talent_builds, account_hash/id key,
unique active code hash, revisions and mutation UUIDs. Account transaction advisory
locks serialize creation/dedup/import and enforce20under concurrent writes. Per-record
optimistic revisions prevent silent rename/delete conflicts across devices. Conflicts
load confirmed server state; a dirty name draft stays editable for explicit retry.
Duplicate create preserves the existing ID/name. Delete erases name/code and retains
only the ID/hash/revision tombstone to reject delayed requests. Runtime rollback keeps
the additive table/data; do not drop it in production after users have saved builds.

Endpoints: GETlist; PUT/{uuid}create/rename; DELETE/{uuid}; POST/import atomic migration.
Mutations require X-Mythic-Account plus expectedRevision/mutationId per build. API bounds
opaque strings; the BFF/current client handle full game-tree validation. Old exports
remain identifiable and deletable even if the game tree changes. Storage does not
assert a legal talent-point graph, current pet or cooldown state.

Guest builds move only through the explicit Move local builds to account button.
This avoids uploading a shared browser's local preferences into a different account.
Bulk migration deduplicates existing codes without renaming account entries, rejects
overcapacity atomically, and acknowledges before removing only the unchanged transferred
local entries. Stale/invalid local exports remain locally for repair. Ambiguous failures
leave the guest copy intact and retries deduplicate safely.

Refresh on mount/focus/visibility/60s and BroadcastChannel invalidation shares server
changes across tabs/devices. Async generations reject old account responses. Writes
already in flight may complete for their original verified account; they cannot be
replayed automatically into another account. Network failure is never shown as a
confirmed save and never silently falls back to guest storage. Guest blocked-storage
fallback remains available with a clear reload-loss notice.

Private tests use synthetic verified identities ONLY in *_test.go, with real isolated
PostgreSQL and Auth.js test cookies. Production always uses the normal Battle.net
verifier. No real user tokens or account records are copied into test environments.
Recovery preparation copies schema/goose metadata only from the120GBexisting DB;
existing tables/data are not changed by this additive migration. Isolated restore,
Up/Down compatibility and account/concurrency tests are recorded with the release.

SQL semantics: https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS
https://www.postgresql.org/docs/17/indexes-partial.html
