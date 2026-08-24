export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const configuredKey = process.env.INDEXNOW_KEY;
  const { key } = await context.params;
  if (!configuredKey || key !== `${configuredKey}.txt`) {
    return new Response("not found\n", { status: 404 });
  }

  return new Response(`${configuredKey}\n`, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
