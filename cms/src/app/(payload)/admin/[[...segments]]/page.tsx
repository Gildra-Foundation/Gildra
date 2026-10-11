import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import config from "@payload-config";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";

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
    const { user } = await payload.auth({ headers: await headers() });
    if (user) {
      const sites = await writableSites(payload, user, collection);
      if (!selectionAllows((await cookies()).get(SITE_COOKIE)?.value, sites)) {
        redirect(`/admin/select-site?collection=${encodeURIComponent(collection)}`);
      }
    }
  }
  return RootPage({ config, params, searchParams, importMap });
}
