import "server-only";
import { cookies } from "next/headers";
import { homeThemeCookie, homeThemes, isHomeTheme, type HomeThemeId } from "@/components/platform/home/homeThemes";

/** Focal point of each character's homepage painting when it is the page's scene. */
const focus: Record<HomeThemeId, string> = {
  arthas: "62% 24%",
  illidan: "58% 20%",
  garek: "60% 22%",
  varok: "64% 26%",
};

/**
 * The account pages are rendered per request (Battle.net session), so they can
 * open on the character the reader chose on the homepage: same cookie, same art.
 */
export async function characterScene() {
  const saved = (await cookies()).get(homeThemeCookie)?.value;
  const id: HomeThemeId = isHomeTheme(saved) ? saved : "arthas";
  const theme = homeThemes.find((entry) => entry.id === id) ?? homeThemes[0];
  return { art: `/assets/wow/character-book/intro/${theme.art}`, position: focus[theme.id] };
}
