#!/usr/bin/env node
// IndexNow ping after a release: tells Bing, Yandex, Seznam and the other IndexNow engines
// which sitemap URLs to recrawl (Google does not use IndexNow; it reads the sitemap).
//
//   INDEXNOW_KEY=… node scripts/indexnow.mjs                 dry run: count and print the URLs
//   INDEXNOW_KEY=… node scripts/indexnow.mjs --send          submit every sitemap URL
//   INDEXNOW_KEY=… node scripts/indexnow.mjs --send --only /wow/professions,/tier-lists
//                                                            submit only URLs under these paths (both languages)
//   … --records                                              also read the library record files
//                                                            (/sitemaps/library/<dataset>/<lang>/<shard>: ~1 M URLs)
//
// The key is the one the site serves at https://gildra.net/<key>.txt (INDEXNOW_KEY of the web
// container: `sudo docker exec gildra-web-1 printenv INDEXNOW_KEY`); it is never printed.
// SITE (default https://gildra.net) is where the sitemap and the key file are read.

const site = (process.env.SITE ?? "https://gildra.net").replace(/\/$/, "");
const key = process.env.INDEXNOW_KEY ?? "";
const args = process.argv.slice(2);
const send = args.includes("--send");
const records = args.includes("--records");
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1] ?? "" : "";
const only = onlyArg.split(",").map((path) => path.trim()).filter(Boolean);

if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
  console.error("INDEXNOW_KEY is missing or malformed (8–128 letters, digits or dashes).");
  process.exit(2);
}

async function text(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));

const keyFile = `${site}/${key}.txt`;
if ((await text(keyFile)).trim() !== key) {
  console.error("The site does not serve the key file for this key; engines would reject the ping.");
  process.exit(2);
}

const RECORD_FILE = /\/sitemaps\/library\/[^/]+\/(?:en|ru)\/[^/]+$/;
const children = locs(await text(`${site}/sitemap.xml`)).filter((child) => records || !RECORD_FILE.test(child));
const urls = [];
for (const child of children) urls.push(...locs(await text(child.replace(/^https:\/\/gildra\.net/, site))));
const host = new URL(urls[0] ?? site).host;
const matches = (url) => {
  if (!only.length) return true;
  const path = new URL(url).pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  return only.some((prefix) => path === prefix || path.startsWith(`${prefix.replace(/\/$/, "")}/`));
};
const picked = [...new Set(urls)].filter(matches);
console.log(`${picked.length} of ${urls.length} sitemap URLs${only.length ? ` under ${only.join(", ")}` : ""}`);

if (!send) {
  for (const url of picked.slice(0, 20)) console.log(`  ${url}`);
  if (picked.length > 20) console.log(`  … and ${picked.length - 20} more`);
  console.log("Dry run; add --send to submit.");
  process.exit(0);
}

// One request takes up to 10 000 URLs.
for (let start = 0; start < picked.length; start += 10_000) {
  const urlList = picked.slice(start, start + 10_000);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList }),
    signal: AbortSignal.timeout(60_000),
  });
  // 200 = accepted, 202 = accepted, key check pending; anything else is an error.
  console.log(`IndexNow ${urlList.length} URLs → HTTP ${response.status}`);
  if (response.status !== 200 && response.status !== 202) process.exitCode = 1;
}
