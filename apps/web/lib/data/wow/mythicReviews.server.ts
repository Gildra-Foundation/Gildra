import "server-only";
import mdt from "@/data/wow/mythic-reviews/mdt.json";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import ruby from "@/data/wow/mythic-reviews/ruby-life-pools.json";
import altar from "@/data/wow/mythic-reviews/altar-of-fangs.json";
import murder from "@/data/wow/mythic-reviews/murder-row.json";
import den from "@/data/wow/mythic-reviews/den-of-nalorakk.json";
import vale from "@/data/wow/mythic-reviews/the-blinding-vale.json";
import arena from "@/data/wow/mythic-reviews/voidscar-arena.json";
import kings from "@/data/wow/mythic-reviews/kings-rest.json";
import temple from "@/data/wow/mythic-reviews/temple-of-sethraliss.json";

export const dungeonSourceReviews = { "ruby-life-pools": ruby, "altar-of-fangs": altar, "murder-row": murder, "den-of-nalorakk": den, "the-blinding-vale": vale, "voidscar-arena": arena, "kings-rest": kings, "temple-of-sethraliss": temple };

export function getMythicSourceReview(slug: DungeonSlug) { return { review: dungeonSourceReviews[slug], mdt: mdt[slug] }; }
