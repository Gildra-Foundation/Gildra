import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import config from "@payload-config";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createLocalReq, getPayload } from "payload";

import { selectionAllows, SITE_COOKIE, siteScopedCreate, writableSites } from "@/admin/siteChoice";
import { importMap } from "../importMap";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

export default async function Page({ params, searchParams }: Args) {
  // Creating a site-scoped document without a usable site selection would make
  // the native autosave create fail on the required site and show an empty
  // view. Send the user to "Choose a site" first (src/components/SelectSiteView).
  const collection = siteScopedCreate((await params).segments);
  if (collection) {
    const payload = await getPayload({ config });
    const requestHeaders = await headers();
    const { user } = await payload.auth({ headers: requestHeaders });
    if (user) {
      const sites = await writableSites(payload, user, collection);
      const selected = (await cookies()).get(SITE_COOKIE)?.value;
      const language = (await searchParams).locale;
      if (!selectionAllows(selected, sites)) {
        const suffix = language === "en" || language === "ru" ? `&locale=${language}` : "";
        redirect(`/admin/select-site?collection=${encodeURIComponent(collection)}${suffix}`);
      }
      if ((collection === "guides" || collection === "pages") && (language === "en" || language === "ru")) {
        // Payload's autosave bootstrap drops the locale from its redirect.
        // Create the same empty draft with normal access, then keep the chosen
        // language when entering the native editor.
        const req = await createLocalReq({ user, locale: language, req: { headers: new Headers(requestHeaders) } }, payload);
        const doc = await payload.create({ collection, req, user, overrideAccess: false,
          locale: language, fallbackLocale: false, draft: true, depth: 0,
          data: { site: selected, _status: "draft" } as never });
        redirect(`/admin/collections/${collection}/${doc.id}?locale=${language}`);
      }
    }
  }
  return RootPage({ config, params, searchParams, importMap });
}
