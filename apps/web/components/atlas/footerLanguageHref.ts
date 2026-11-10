import { altPath, type Lang } from "@/lib/i18n-paths";
import { singleLanguagePaths } from "@/lib/routes/registry";

/** English-only service sections: their Russian link goes to the Russian hub. */
const ENGLISH_ONLY = ["/api-console", "/blueprints", "/dev"];

const within = (path: string, section: string) => path === section || path.startsWith(`${section}/`);

/** The page in `to`; a page without a twin in that language (or the 404: `missing`) links to that language's hub. */
export function footerLanguageHref(pathname: string | null, to: Lang, missing = false) {
  const path = altPath(pathname ?? "/", "en").replace(/\/$/, "") || "/";
  const single = [...singleLanguagePaths].find(([section]) => within(path, section));
  const twinless = missing || (single && single[1] !== to) || (to === "ru" && ENGLISH_ONLY.some(section => within(path, section)));
  return twinless ? (to === "ru" ? "/ru/wow" : "/wow") : altPath(path, to);
}
