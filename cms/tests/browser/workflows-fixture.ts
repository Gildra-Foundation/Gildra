import { as, bootPayload, lexical, makeStaff } from "../helpers/payload";

// bootPayload refuses non-local/non-test database URLs before changing anything.
const { payload } = await bootPayload("workflow_browser");
try {
  const sites = (await payload.find({ collection: "sites", overrideAccess: true })).docs;
  const gildra = sites.find((s) => s.slug === "gildra")!.id;
  const riftden = sites.find((s) => s.slug === "riftden")!.id;
  const owner = await makeStaff(payload, { email: "owner@workflow.test", owner: true });
  await makeStaff(payload, { email: "gadmin@workflow.test", sites: [{ site: gildra, role: "admin" }] });
  const author = await makeStaff(payload, { email: "author@workflow.test", sites: [{ site: gildra, role: "author" }] });
  await makeStaff(payload, { email: "foreign@workflow.test", sites: [{ site: riftden, role: "editor" }] });
  const reader = await payload.create({ collection: "members", overrideAccess: true, disableVerificationEmail: true,
    data: { email: "dual@workflow.test", password: "local-test-password-1", _verified: true,
      memberships: [{ site: gildra, status: "active" }, { site: riftden, status: "active" }] } as never });
  await payload.create({ collection: "member-profiles", overrideAccess: true,
    data: { member: reader.id, handle: "workflow-reader", displayName: "Workflow Reader" } });
  await payload.create({ collection: "members", overrideAccess: true, disableVerificationEmail: true,
    data: { email: "foreign-reader@workflow.test", password: "local-test-password-1", _verified: true,
      memberships: [{ site: riftden, status: "active" }] } as never });
  const article = await payload.create({ collection: "guides", overrideAccess: true, locale: "en",
    data: { site: gildra, slug: "workflow-published", title: "Needle published article", summary: "Published English summary",
      content: lexical("Published English body for the workflow browser test."), _status: "published" } as never });
  // An empty RU draft exercises filling from a published source without publishing.
  await payload.update({ collection: "guides", id: article.id, ...as(owner), locale: "ru", draft: true,
    data: { title: "", summary: "", content: lexical(""), _status: "draft" } as never });
  for (let n = 0; n < 26; n++) await payload.create({ collection: "guides", overrideAccess: true, locale: "en",
    data: { site: gildra, slug: `workflow-${n}`, title: `Workflow draft ${n}`, summary: "Draft summary", content: lexical("Draft body"), _status: "draft" } as never });
  console.log(`WORKFLOW_FIXTURE ${JSON.stringify({ gildra, riftden, readerID: reader.id, articleID: article.id, authorID: author.id })}`);
} finally {
  await payload.db.destroy?.();
}
