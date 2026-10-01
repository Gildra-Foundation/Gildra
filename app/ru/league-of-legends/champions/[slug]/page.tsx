// Hidden for the WoW-only MVP: definePage() answers 404 for games outside MVP_VISIBLE_GAMES (lib/mvp.ts).
import { championPage } from "@/lib/games/league-of-legends/pages/champion";

export const revalidate = 3600;
export const generateMetadata = championPage.ru.generateMetadata;
export default championPage.ru.Page;
