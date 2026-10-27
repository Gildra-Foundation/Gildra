import { redirect } from "next/navigation";
import { midnightDelves } from "@/lib/data/wow";

export const dynamicParams = false;
export function generateStaticParams() { return midnightDelves.map(({ slug }) => ({ delve: slug })); }
/** A delve gets its own page once its strategy and rewards are published; until then, the delve atlas. */
export default function Page() { redirect("/wow/delves"); }
