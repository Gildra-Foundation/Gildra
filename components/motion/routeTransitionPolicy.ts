/** Only pathname changes turn a leaf; filters and chapter anchors stay on the current page. */
export function shouldTurnBook(fromPathname: string, toPathname: string) {
  return fromPathname.replace(/\/+$/, "") !== toPathname.replace(/\/+$/, "");
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
