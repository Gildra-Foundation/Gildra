import { notFound, permanentRedirect } from "next/navigation";

export const dynamicParams = false;
export function generateStaticParams() { return [{ season: "midnight-season-2" }]; }

/** Keep the current-season URL as an exact alias of the published atlas. */
export default async function Page({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  if (season !== "midnight-season-2") notFound();
  permanentRedirect("/wow/mythic-plus");
}
