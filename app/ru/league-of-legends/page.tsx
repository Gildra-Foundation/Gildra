import { leagueHomePage } from "@/lib/games/league-of-legends/pages/home";

export const revalidate = 3600;
export const generateMetadata = leagueHomePage.ru.generateMetadata;
export default leagueHomePage.ru.Page;
