/** Mists of Pandaria Classic: classes, specializations and class talents (data/wow/mists/classes.json). */
export type MistsWords = { en: string; ru: string };
export type MistsRole = "tank" | "healer" | "damage";

export type MistsTalent = {
  id: number;
  spellId: number;
  name: MistsWords;
  icon: string;
  castTime?: MistsWords;
  cooldown?: MistsWords;
  range?: MistsWords;
  cost?: MistsWords;
  description: MistsWords;
};
export type MistsTier = { level: number; talents: MistsTalent[] };
export type MistsSpec = { id: number; slug: string; name: MistsWords; role: MistsRole; primaryStat: string | null; icon: string; description: MistsWords };
export type MistsClass = { id: number; slug: string; name: MistsWords; color: string; icon: string; specs: MistsSpec[]; tiers: MistsTier[] };

/** A build in the address: `?spec=<slug>&talents=<one digit per tier, 0 = none, 1–3 = column>`. */
export type MistsBuild = { spec: string | null; picks: number[] };

export function parseMistsBuild(cls: MistsClass, spec: string | null | undefined, talents: string | null | undefined): MistsBuild {
  const picks = cls.tiers.map((_, tier) => {
    const digit = Number(talents?.[tier] ?? 0);
    return Number.isInteger(digit) && digit >= 1 && digit <= 3 ? digit : 0;
  });
  return { spec: cls.specs.some((item) => item.slug === spec) ? spec! : null, picks };
}

export function mistsBuildQuery(build: MistsBuild) {
  const params = new URLSearchParams();
  if (build.spec) params.set("spec", build.spec);
  if (build.picks.some(Boolean)) params.set("talents", build.picks.join(""));
  const query = params.toString();
  return query ? `?${query}` : "";
}
