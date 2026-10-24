import { NextResponse, type NextRequest } from "next/server";
import { isUnpublishedPath } from "@/lib/wow/publication";
import { isHiddenForMvpPath } from "@/lib/mvp";
import { runtimeFlags } from "@/lib/flags";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname === "/ru" || request.nextUrl.pathname.startsWith("/ru/")
    ? "ru"
    : "en";

  requestHeaders.set("x-gildra-locale", locale);
  // WoW-only MVP: pages hidden by lib/mvp.ts answer a real HTTP 404. Rewriting
  // to a path no route owns makes Next render the branded not-found page with
  // status 404; `notFound()` inside the page alone would stream a 200 (the root
  // loading.tsx has already flushed the shell). The locale prefix keeps the
  // Russian chrome on /ru/** URLs.
  // Dev galleries (/dev/blocks, /dev/atlas) exist only with GILDRA_DEV_GALLERY=1 in production.
  const devGalleryOff = !runtimeFlags().devGallery && /^\/dev(\/|$)/.test(request.nextUrl.pathname);
  const response = devGalleryOff || isUnpublishedPath(request.nextUrl.pathname) || isHiddenForMvpPath(request.nextUrl.pathname) || unknownTalentSpec(request.nextUrl.pathname)
    ? NextResponse.rewrite(Object.assign(request.nextUrl.clone(), { pathname: `${locale === "ru" ? "/ru" : ""}/_hidden-for-mvp/404` }), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  return staging(response);
}

/** Talent calculators exist only for the known specs; the talents loading.tsx would stream a 200 before notFound(). */
function unknownTalentSpec(pathname: string) {
  const match = /^(?:\/ru)?\/talents\/([^/]+)\/?$/.exec(pathname);
  return Boolean(match && !getTalentSpecTheme(match[1]));
}

/** Staging copy (GILDRA_STAGING=1): never indexed, and the page shows a badge (StagingBadge reads the cookie). */
function staging(response: NextResponse) {
  if (!runtimeFlags().staging) return response;
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.cookies.set("gildra-env", "staging", { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|monitoring|.*\\..*).*)"],
};
