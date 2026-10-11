/**
 * Video links accepted by the article "Video" block. Only these providers are
 * embedded, from ids parsed with strict patterns (never the raw URL). The site
 * renderers (lib/cms/richtext.ts in both frontends) use the same patterns.
 */
export type VideoRef =
  | { provider: "youtube"; id: string }
  | { provider: "twitch-video"; id: string }
  | { provider: "twitch-clip"; id: string }
  | { provider: "rutube"; id: string };

export function parseVideoUrl(input: unknown): VideoRef | null {
  if (typeof input !== "string" || input.length > 500) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const path = url.pathname;
  let m: RegExpMatchArray | null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = url.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtu.be" && (m = path.match(/^\/([A-Za-z0-9_-]{11})$/))) return { provider: "youtube", id: m[1] };
  if (host === "twitch.tv" && (m = path.match(/^\/videos\/(\d{5,15})$/))) return { provider: "twitch-video", id: m[1] };
  if (host === "twitch.tv" && (m = path.match(/^\/[A-Za-z0-9_]{2,30}\/clip\/([A-Za-z0-9_-]{4,100})$/))) return { provider: "twitch-clip", id: m[1] };
  if (host === "clips.twitch.tv" && (m = path.match(/^\/([A-Za-z0-9_-]{4,100})$/))) return { provider: "twitch-clip", id: m[1] };
  if (host === "rutube.ru" && (m = path.match(/^\/(?:video|play\/embed)\/([a-f0-9]{32})\/?$/))) return { provider: "rutube", id: m[1] };
  return null;
}
