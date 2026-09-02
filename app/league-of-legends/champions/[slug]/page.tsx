import { championPage } from "@/lib/games/league-of-legends/pages/champion";

export const revalidate = 3600;
export const generateMetadata = championPage.en.generateMetadata;
export default championPage.en.Page;
