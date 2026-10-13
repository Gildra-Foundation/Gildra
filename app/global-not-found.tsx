import { NotFoundPage, notFoundMetadata } from "@/components/layout/NotFoundPage";
import { RootDocument, rootMetadata } from "./root-document";

export const metadata = { ...rootMetadata, ...notFoundMetadata };

/** 404 of URLs that match no route. The site has two root layouts, so this page
 *  brings its own document; the language comes from the URL after hydration. */
export default function GlobalNotFound() {
  return <RootDocument lang="en"><NotFoundPage /></RootDocument>;
}
