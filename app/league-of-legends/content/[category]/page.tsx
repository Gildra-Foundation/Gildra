// Hidden for the WoW-only MVP: definePage() answers 404 for games outside MVP_VISIBLE_GAMES (lib/mvp.ts).
import { contentPage } from "@/lib/games/league-of-legends/pages/content";

export const revalidate = 3600;
export const generateMetadata = contentPage.en.generateMetadata;
export default contentPage.en.Page;
