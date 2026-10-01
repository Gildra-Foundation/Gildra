import { NextResponse, type NextRequest } from "next/server";
import { isHiddenForMvpPath } from "@/lib/mvp";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname === "/ru" || request.nextUrl.pathname.startsWith("/ru/")
    ? "ru"
    : "en";
  const localizedPath = locale === "ru" ? request.nextUrl.pathname.slice(3) || "/" : request.nextUrl.pathname;

  requestHeaders.set("x-gildra-locale", locale);
  // WoW-only MVP: pages hidden by lib/mvp.ts answer a real HTTP 404. Rewriting
  // to a path no route owns makes Next render the branded not-found page with
  // status 404; `notFound()` inside the page alone would stream a 200 (the root
  // loading.tsx has already flushed the shell). Two segments, because a single
  // one is owned by app/[key]/route.ts (plain-text 404); the locale prefix keeps
  // the Russian chrome on /ru/** URLs.
  if (isHiddenForMvpPath(request.nextUrl.pathname)) {
    const hidden = request.nextUrl.clone();
    hidden.pathname = `${locale === "ru" ? "/ru" : ""}/_hidden-for-mvp/404`;
    return NextResponse.rewrite(hidden, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next|monitoring|.*\\..*).*)"],
};
