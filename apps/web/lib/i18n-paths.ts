export type Lang = "en" | "ru";

/** Prefix internal links with the Russian locale when needed. */
export const p = (lang: Lang, href: string) => {
  if (lang !== "ru") return href;
  if (href.startsWith("/#")) return `/ru${href.slice(1) ? "#" + href.split("#")[1] : ""}`;
  if (href === "/") return "/ru";
  if (href.startsWith("/")) return `/ru${href}`;
  return href;
};

export const langOf = (pathname: string | null): Lang =>
  pathname === "/ru" || pathname?.startsWith("/ru/") ? "ru" : "en";

export const altPath = (pathname: string | null, to: Lang) => {
  const current = pathname ?? "/";
  const bare = current === "/ru" ? "/" : current.startsWith("/ru/") ? current.slice(3) : current;
  return to === "ru" ? (bare === "/" ? "/ru" : `/ru${bare}`) : bare;
};
