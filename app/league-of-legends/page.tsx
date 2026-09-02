import { leagueHomePage } from "@/lib/games/league-of-legends/pages/home";

export const revalidate = 3600;
export const generateMetadata = leagueHomePage.en.generateMetadata;
export default leagueHomePage.en.Page;
