import { readFileSync, writeFileSync } from "node:fs";
import { as, bootPayload, lexical, makeStaff } from "../helpers/payload";
const artifact = process.env.CMS_QA_DIR;
if (!artifact) throw new Error("CMS_QA_DIR is required");
const qa = JSON.parse(readFileSync(`${artifact}/qa.json`, "utf8"));
const { payload } = await bootPayload("publication_browser");
try {
 const sites = (await payload.find({ collection: "sites", overrideAccess: true, depth: 0 })).docs;
 const siteIDs = Object.fromEntries(sites.map((s) => [s.slug, s.id]));
 const users: Record<string, Awaited<ReturnType<typeof makeStaff>>> = {};
 users.owner = await makeStaff(payload, { email: "owner@publication.test", owner: true });
 for (const site of ["gildra", "riftden"]) {
  await payload.update({ collection: "sites", id: siteIDs[site], overrideAccess: true, data: { publicUrl: qa.origins[site], revalidateUrl: `${qa.origins[site]}/api/cms/revalidate` } });
  for (const role of ["admin", "editor", "author", "analyst"] as const) users[`${site}_${role}`] = await makeStaff(payload, { email: `${site}-${role}@publication.test`, sites: [{ site: siteIDs[site], role }] });
 }
 users.mixed = await makeStaff(payload, { email: "mixed@publication.test", sites: [{ site: siteIDs.gildra, role: "editor" }, { site: siteIDs.riftden, role: "author" }] });
 users.reverse = await makeStaff(payload, { email: "reverse@publication.test", sites: [{ site: siteIDs.gildra, role: "author" }, { site: siteIDs.riftden, role: "editor" }] });
 const articles: Record<string, number> = {};
 for (const site of ["gildra", "riftden"]) {
  for (const author of ["author", "editor"]) {
   const article = await payload.create({ collection: "guides", locale: "en", draft: true, ...as(users[`${site}_${author}`]), data: { site: siteIDs[site], slug: `qa-${site}-${author}-draft`, title: `${site} ${author} draft`, summary: "Isolated QA fixture", content: lexical("Isolated draft body") } });
   articles[`${site}_${author}_draft`] = article.id;
  }
  const article = await payload.create({ collection: "guides", locale: "en", ...as(users[`${site}_editor`]), data: { site: siteIDs[site], slug: `qa-${site}-published`, title: `${site} public original EN`, summary: "Original EN summary", content: lexical("Original EN public body"), _status: "published" } });
  await payload.update({ collection: "guides", id: article.id, locale: "ru", ...as(users[`${site}_editor`]), data: { title: `${site} опубликовано RU`, summary: "Исходное описание RU", content: lexical("Исходное публичное содержание RU"), _status: "published" } });
  articles[`${site}_published`] = article.id;
 }
 const member = await payload.create({ collection: "members", overrideAccess: true, disableVerificationEmail: true, data: { email: "reader@publication.test", password: "local-test-password-1", _verified: true, memberships: [{ site: siteIDs.gildra, status: "active" }, { site: siteIDs.riftden, status: "active" }] } as never });
 await payload.create({ collection: "member-profiles", overrideAccess: true, data: { member: member.id, handle: "publication-fixture", displayName: "Publication QA Reader" } });
 const safe = { sites: siteIDs, articles, member: member.id, users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, email: user.email }])) };
 writeFileSync(`${artifact}/fixture.json`, JSON.stringify(safe, null, 2) + "\n");console.log("Isolated two-site publication/role fixture ready.");
} finally { await payload.db.destroy?.(); }
process.exit(0);

