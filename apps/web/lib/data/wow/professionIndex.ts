import index from "@/data/wow/professions/index.json";

/** The professions of the hub, in its order (crafting, gathering, secondary): slug, names and icon. */
export const professionIndex = index as readonly { slug: string; name: { en: string; ru: string }; icon: string }[];
