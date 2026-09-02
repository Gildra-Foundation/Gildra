import { specPage } from "@/lib/games/wow/pages/spec";

export const generateStaticParams = specPage.generateStaticParams!;
export const generateMetadata = specPage.en.generateMetadata;
export default specPage.en.Page;
