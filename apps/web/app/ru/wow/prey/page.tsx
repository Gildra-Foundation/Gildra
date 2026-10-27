import { redirect } from "next/navigation";

/** Prey has no page of its own yet: it is a tile of the Season 2 overview. */
export default function Page() { redirect("/ru/wow/midnight/season-2#prey"); }
