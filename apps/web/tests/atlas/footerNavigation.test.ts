import assert from "node:assert/strict";
import { it } from "node:test";
import { footerGroups } from "../../components/atlas/footerLinks.ts";
import { navigationRealms, linksFor } from "../../components/platform/navigation/navigationMap.ts";

for (const locale of ["en", "ru"] as const) {
  it(`footer retains every shared navigation destination exactly once (${locale})`, () => {
    const hrefs = footerGroups(locale).flatMap(group => group.links.map(link => link.href));
    assert.equal(new Set(hrefs).size, hrefs.length);
    for (const realm of navigationRealms) for (const link of linksFor(realm, locale)) assert.ok(hrefs.includes(link.href), link.href);
    assert.equal(hrefs.includes("/wow/stories"), locale === "ru");
    for (const href of ["/", "/wow/forever", "/wow/mists", "/privacy"]) assert.ok(hrefs.includes(href), href);
    assert.ok(footerGroups(locale).find(group => group.id === "world")!.links.some(link => link.href === "/wow/map"));
  });
}
