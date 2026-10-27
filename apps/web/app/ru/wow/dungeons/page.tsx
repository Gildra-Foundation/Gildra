import { permanentRedirect } from "next/navigation";

/** The dungeon list lives on the Mythic+ hub. */
export default function Page() { permanentRedirect("/ru/wow/mythic-plus#dungeons"); }
