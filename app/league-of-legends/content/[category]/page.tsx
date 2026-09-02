import { contentPage } from "@/lib/games/league-of-legends/pages/content";

export const revalidate = 3600;
export const generateMetadata = contentPage.en.generateMetadata;
export default contentPage.en.Page;
