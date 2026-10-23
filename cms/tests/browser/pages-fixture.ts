import { SKIP_REVALIDATION } from "../../src/editorial/policy";
import { bootPayload, makeStaff } from "../helpers/payload";

// bootPayload refuses non-local/non-test database URLs before changing anything.
const { payload } = await bootPayload("pages_browser");
try {
  const sites = (await payload.find({ collection: "sites", overrideAccess: true })).docs;
  const gildra = sites.find((s) => s.slug === "gildra")!.id;
  await makeStaff(payload, { email: "owner@pages-browser.test", owner: true });
  // Published English blocks only: the Russian version starts empty (code page on /ru/privacy).
  const page = await payload.create({
    collection: "pages",
    overrideAccess: true,
    locale: "en",
    context: { [SKIP_REVALIDATION]: true },
    data: {
      site: gildra,
      slug: "wow/privacy",
      title: "Privacy policy",
      blocks: [{ type: "legal", props: { title: "Privacy Policy", updated: "Updated: October 22, 2026", sections: [{ heading: "What we store", text: "Preferences." }], backLabel: "← Back" } }],
      _status: "published",
    } as never,
  });
  console.log(`PAGES_FIXTURE ${JSON.stringify({ gildra, pageID: page.id })}`);
} finally {
  await payload.db.destroy?.();
}
