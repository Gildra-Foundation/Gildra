import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.pathname === "/ru" || request.nextUrl.pathname.startsWith("/ru/")
    ? "ru"
    : "en";
  const localizedPath = locale === "ru" ? request.nextUrl.pathname.slice(3) || "/" : request.nextUrl.pathname;

  requestHeaders.set("x-gildra-locale", locale);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next|monitoring|.*\\..*).*)"],
};
