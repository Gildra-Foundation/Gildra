import { championPage } from "@/lib/games/league-of-legends/pages/champion";

export const revalidate = 3600;
export const generateMetadata = championPage.ru.generateMetadata;
export default championPage.ru.Page;
