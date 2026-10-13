#!/usr/bin/env node
// Local fix for Next.js 16 (runs as the root postinstall and in the Docker deps
// stage, so dev, CI and the production image get the same next package).
//
// The image optimizer fetches a local source image (/_next/image?url=/assets/…)
// through a mocked request/response that carries the CLIENT's socket. The static
// file sender (send + on-finished) treats the mocked response as finished once
// that socket closes, so a client that aborts while the source is read (nginx 499)
// leaves the mocked response unfinished forever. The image cache dedupes requests
// per key, so every later request for that image, width and format then hangs
// until the container is replaced (nginx 504 after 60 s; seen on the lair map and
// hero art, 2026-10-13). The internal response does not need the socket: detach it.
// Repro: apps/web/scripts/image-abort-check.mjs against a cold image cache.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const file = require.resolve("next/dist/server/image-optimizer.js");
const marker = "mocked.res.socket = null; // gildra: scripts/patch-next.mjs";
const anchor = "            maximumResponseBody\n        });\n        await handleRequest(mocked.req, mocked.res, (0, _url.parseReqUrl)(href));";

const source = readFileSync(file, "utf8");
if (source.includes(marker)) {
  console.log("patch-next: image optimizer already patched");
} else if (source.split(anchor).length !== 2) {
  console.error(`patch-next: ${file} changed (Next ${require("next/package.json").version}). Check whether fetchInternalImage still passes the client socket to the mocked response, then update or drop scripts/patch-next.mjs.`);
  process.exit(1);
} else {
  writeFileSync(file, source.replace(anchor, anchor.replace("        await handleRequest", `        ${marker}\n        await handleRequest`)));
  console.log("patch-next: image optimizer no longer ties its internal response to the client socket");
}
