import { contentPage } from "@/lib/games/league-of-legends/pages/content";

export const revalidate = 3600;
export const generateMetadata = contentPage.ru.generateMetadata;
export default contentPage.ru.Page;
