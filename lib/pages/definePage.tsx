/**
 * definePage — one page definition, two routes.
 *
 * A route file becomes three lines:
 *   import { homePage } from "@/lib/games/wow/pages/home";
 *   export const generateMetadata = homePage.en.generateMetadata;
 *   export default homePage.en.Page;
 * and its /ru mirror uses `.ru`. Segment config literals (`revalidate`,
 * `dynamic`) stay in the route file — Next reads them statically.
 */
import { cache } from "react";
import { permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { GAMES, gameHref, type ApiLocale, type GameDefinition, type GameSlug } from "@/lib/games/registry";
import type { Lang } from "@/lib/i18n";
import type { PageConfig } from "@/lib/blocks/page";
import { Page } from "@/components/blocks/Page";
import { pageMetadata, type PageMetaInput } from "@/lib/blocks/metadata";

type Params = Record<string, string>;
type Search = Record<string, string | string[] | undefined>;
type RouteProps<P, S> = { params: Promise<P>; searchParams: Promise<S> };

export type PageCtx<P, S, D> = {
  game: GameDefinition;
  lang: Lang;
  apiLocale: ApiLocale;
  params: P;
  search: S;
  data: D;
};

export type PageDefinition<P extends Params, S extends Search, D> = {
  game: GameSlug;
  /** Game-relative canonical path for the given params ("/", "/champions/aatrox"). */
  path: (params: P) => string;
  staticParams?: () => P[] | Promise<P[]>;
  /** Read `searchParams` (opts the route into dynamic rendering). */
  readsSearch?: boolean;
  /** Legacy `?locale=ru_RU|en_US` links → 308 to the `/ru` (or EN) URL. Implies readsSearch. */
  legacyLocaleQuery?: boolean;
  /** Fetch page data once per request (shared by metadata and page); call notFound() inside. */
  load?: (ctx: Omit<PageCtx<P, S, never>, "data">) => Promise<D>;
  meta: (ctx: PageCtx<P, S, D>) => PageMetaInput;
  page: (ctx: PageCtx<P, S, D>) => PageConfig;
};

type RouteExports<P, S> = {
  Page: (props: RouteProps<P, S>) => Promise<React.JSX.Element>;
  generateMetadata: (props: RouteProps<P, S>) => Promise<Metadata>;
};

export type DefinedPage<P, S> = {
  en: RouteExports<P, S>;
  ru: RouteExports<P, S>;
  generateStaticParams?: () => P[] | Promise<P[]>;
};

export function definePage<
  P extends Params = Record<never, never>,
  S extends Search = Record<never, never>,
  D = undefined,
>(def: PageDefinition<P, S, D>): DefinedPage<P, S> {
  const game = GAMES[def.game];

  const resolve = cache(
    async (lang: Lang, paramsKey: string, searchKey: string): Promise<PageCtx<P, S, D>> => {
      const params = JSON.parse(paramsKey) as P;
      const search = JSON.parse(searchKey) as S;
      const base = { game, lang, apiLocale: game.apiLocale[lang], params, search };
      const data = def.load ? await def.load(base) : (undefined as D);
      return { ...base, data };
    },
  );

  const ctxFor = async (lang: Lang, props: RouteProps<P, S>) => {
    const params = (await props.params) ?? ({} as P);
    const search =
      def.readsSearch || def.legacyLocaleQuery ? ((await props.searchParams) ?? ({} as S)) : ({} as S);
    if (def.legacyLocaleQuery) {
      const legacy = (search as Record<string, unknown>).locale;
      const wants: Lang | null = legacy === "ru_RU" ? "ru" : legacy === "en_US" ? "en" : null;
      if (wants && wants !== lang) permanentRedirect(gameHref(game, wants, def.path(params)));
    }
    return resolve(lang, JSON.stringify(params), JSON.stringify(search));
  };

  const forLang = (lang: Lang): RouteExports<P, S> => ({
    Page: async (props) => {
      const ctx = await ctxFor(lang, props);
      return <Page config={def.page(ctx)} lang={lang} />;
    },
    generateMetadata: async (props) => {
      const ctx = await ctxFor(lang, props);
      return pageMetadata({ game, lang, path: def.path(ctx.params), ...def.meta(ctx) });
    },
  });

  return {
    en: forLang("en"),
    ru: forLang("ru"),
    ...(def.staticParams ? { generateStaticParams: def.staticParams } : {}),
  };
}
