import raw from "@/data/wow/forever/talents/trees.json";
import type { TalentDataset } from "./types";

export const foreverTalents: TalentDataset = raw;
export const talentClass = (slug: string) => foreverTalents.classes.find(cls => cls.slug === slug);
