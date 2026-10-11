import { cmsConfig } from "@/lib/cms/config";
import { handleReader } from "@/lib/cms/readers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

/** Same-site reader proxy; disabled (404) unless CMS_READERS_ENABLED=1 and the CMS is configured. */
async function handle(request: Request, { params }: Ctx) {
  const config = cmsConfig();
  if (!config.readersEnabled) return Response.json({ status: "not-found" }, { status: 404 });
  return handleReader((await params).action, request, {
    cmsUrl: config.internalUrl,
    site: config.site,
    publicOrigin: config.publicOrigin,
    secure: config.publicOrigin.startsWith("https://"),
    cookieBase: "gildra_reader",
  });
}

export { handle as GET, handle as POST, handle as PATCH };
