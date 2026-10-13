/** Locale prefixes, trailing slashes and hub aliases share one page identity. */
export function bookPageIdentity(pathname: string) {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  return path === "/lairs" ? "/wow/lairs" : path;
}

/** Only a new page turns a leaf; language, filters and anchors stay still. */
export function shouldTurnBook(fromPathname: string, toPathname: string) {
  return bookPageIdentity(fromPathname) !== bookPageIdentity(toPathname);
}

/** A protected character route can resolve through an auth redirect after its
 *  pathname briefly commits. Treat that server redirect as the same turn. */
export function isCharacterAuthRedirect(fromPathname: string, toPathname: string) {
  const source = fromPathname.replace(/^\/ru(?=\/|$)/, "");
  const destination = toPathname.replace(/^\/ru(?=\/|$)/, "");
  return /^\/wow\/characters\/[^/]+\/?$/.test(source)
    && /^\/login\/?$/.test(destination);
}

export function isBookPagePath(pathname: string) {
  return !/^\/(?:api|v1|_next|assets)(?:\/|$)/.test(pathname)
    && !/\.(?:pdf|zip|csv|json|xml|png|jpe?g|webp|svg|mp4|mp3)$/i.test(pathname);
}

export function bookLocale(pathname: string): "ru" | "en" {
  return /^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en";
}
