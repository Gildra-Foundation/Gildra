import { notFound } from "next/navigation";
import { definePage } from "@/lib/pages/definePage";
import { findSpecPage, specPages, type SpecPage } from "@/lib/specs";
import { season } from "@/data/site";

/** Permanent spec URLs: /specs/[slug] — one page per tier-table row. */
export const specPage = definePage<{ slug: string }, Record<never, never>, SpecPage>({
  game: "wow",
  path: ({ slug }) => `/specs/${slug}`,
  staticParams: () => specPages.map((p) => ({ slug: p.slug })),
  load: async ({ params }) => findSpecPage(params.slug) ?? notFound(),
  meta: ({ lang, data: p }) => {
    const name = p.row.spec.name;
    return lang === "ru"
      ? {
          title: `${name} — ${p.tier.toUpperCase()}-тир Mythic+ | Gildra`,
          description: `${name} в ${season.expansion} Сезон 1: очки ${p.row.score}, популярность ${p.row.pop}, средний ключ ${p.row.key}. Билды и гайды на Gildra.`,
        }
      : {
          title: `${name} — Mythic+ ${p.tier.toUpperCase()}-Tier | Gildra`,
          description: `${name} in ${season.expansion} ${season.season}: score ${p.row.score}, ${p.row.pop} popularity, avg key ${p.row.key}. Builds and guides on Gildra.`,
        };
  },
  page: ({ data: p }) => ({
    id: "wow/spec",
    game: "wow",
    path: `/specs/${p.slug}`,
    layout: "default",
    blocks: [
      {
        type: "container",
        props: { variant: "route", className: "specpage" },
        children: [{ type: "wow.specBody", props: { slug: p.slug } }],
      },
    ],
  }),
});
