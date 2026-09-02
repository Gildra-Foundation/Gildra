import { specPage } from "@/lib/games/wow/pages/spec";

export const generateStaticParams = specPage.generateStaticParams!;
export const generateMetadata = specPage.ru.generateMetadata;
export default specPage.ru.Page;
