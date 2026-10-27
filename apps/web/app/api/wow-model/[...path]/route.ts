import { Readable } from "node:stream";
import { constants, createBrotliCompress } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";

const MODEL_ORIGIN = "https://wow.zamimg.com/modelviewer/live/";
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Model binaries (.m2/.skel/.skin/.anim/.bone) are served brotli-compressed:
 * the mannequin's skeleton and body go from 14.6 MB (gzip) to about 11 MB.
 * Cloudflare caches the compressed answer, so each file is compressed once
 * per edge; nginx leaves already-encoded answers alone.
 */
const BINARY = /\.(m2|skel|skin|anim|bone|sk3)$/;
const BROTLI_MIN_BYTES = 64 * 1024;

function brotliStream(body: ReadableStream<Uint8Array>, size: number) {
  const compressor = createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 6,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
      ...(size ? { [constants.BROTLI_PARAM_SIZE_HINT]: size } : {}),
    },
  });
  const source = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
  source.on("error", (error) => compressor.destroy(error));
  return Readable.toWeb(source.pipe(compressor)) as ReadableStream<Uint8Array>;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!path || path.includes("..") || !SAFE_PATH.test(path)) {
    return NextResponse.json({ message: "Invalid model asset path" }, { status: 400 });
  }

  let upstream: Response;
  // Time out waiting for headers only: a 10–19 MB model body takes longer than
  // that on a slow phone, and aborting mid-stream truncates the file.
  const headersTimeout = new AbortController();
  const timer = setTimeout(() => headersTimeout.abort(), 20_000);
  try {
    upstream = await fetch(new URL(path, MODEL_ORIGIN), {
      headers: { "User-Agent": "Gildra character model viewer" },
      cache: "no-store",
      signal: AbortSignal.any([headersTimeout.signal, request.signal]),
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json(
      { message: "Model asset service is temporarily unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  clearTimeout(timer);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { message: "Model asset was not found" },
      { status: upstream.status, headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
  headers.set("Cache-Control", path.startsWith("meta/")
    ? "public, max-age=86400, stale-while-revalidate=604800"
    : "public, max-age=604800, stale-while-revalidate=2592000");
  headers.set("X-Content-Type-Options", "nosniff");
  const contentLength = upstream.headers.get("Content-Length");
  const size = Number(contentLength ?? 0);
  const acceptsBrotli = /\bbr\b/.test(request.headers.get("accept-encoding") ?? "");
  headers.set("Vary", "Accept-Encoding");
  if (acceptsBrotli && BINARY.test(path) && !upstream.headers.get("Content-Encoding") && (!size || size >= BROTLI_MIN_BYTES)) {
    headers.set("Content-Encoding", "br");
    return new NextResponse(brotliStream(upstream.body, size), { status: 200, headers });
  }
  if (contentLength) headers.set("Content-Length", contentLength);
  return new NextResponse(upstream.body, { status: 200, headers });
}
