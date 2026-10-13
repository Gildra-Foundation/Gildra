// IndexNow key file. Crawlers fetch it as /<INDEXNOW_KEY>.txt (the keyLocation
// the API submits); next.config.ts rewrites that one root `.txt` shape here, so
// no catch-all root segment shadows the branded 404 for other single-segment URLs.
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const configuredKey = process.env.INDEXNOW_KEY;
  const { file } = await context.params;
  if (!configuredKey || file !== `${configuredKey}.txt`) {
    return new Response("not found\n", { status: 404 });
  }

  return new Response(`${configuredKey}\n`, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
