import { ogImage, ogStaticParams } from "@/lib/og/routes";

export const alt = "Gildra — World of Warcraft";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export default ogImage("en", "lair");
export const generateStaticParams = () => ogStaticParams("lair");
