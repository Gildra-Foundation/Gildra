import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { PROFESSION_KIT, professionAccentStyle } from "./professionKit";
import { ProfessionItemLabel, ProfessionMoney } from "./ProfessionParts";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { loadProfession, loadProfessionPrices, loadProfessionRecords, professionList, professionRegion, PROFESSION_REGIONS, type ProfessionRegion } from "@/lib/wow/professions/data";
import { buyCost, planRoute, professionIconUrl, shoppingList, specializationUnlocks } from "@/lib/wow/professions/leveling";
import { runtimeFlags } from "@/lib/flags";
import type { ProfessionData, ProfessionPrices } from "@/lib/wow/professions/types";
import { ProfessionKnowledge } from "./ProfessionKnowledge";
import { ProfessionLeveling } from "./ProfessionLeveling";
import { ProfessionProfits } from "./ProfessionProfits";
import { ProfessionSpecializations } from "./ProfessionSpecializations";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";
import { RelatedLinks } from "@/components/wow/shared/RelatedLinks";
import { auctionCategoryHref, professionAuctionCategories, relatedCopy } from "@/components/wow/shared/relatedLinksCopy";
import { auctionCategory, auctionCategoryNames, auctionIconUrl } from "@/lib/wow/auctionMarketCategories";
import { professionSeoTitle } from "@/lib/seo/titles";

type Lang = "en" | "ru";
const path = (lang: Lang, slug: string) => `${lang === "ru" ? "/ru" : ""}/wow/professions/${slug}`;

export async function professionMetadata(lang: Lang, slug: string): Promise<Metadata> {
  const data = await loadProfession(slug);
  if (!data) return {};
  const c = professionsCopy[lang], name = data.name[lang];
  const title = professionSeoTitle(lang, name);
  return { title, description: c.description(name), alternates: pairedAlternates(lang, `/wow/professions/${slug}`),
    openGraph: pageOpenGraph(lang, { title, description: c.description(name), path: path(lang, slug) }) };
}

export const professionStaticParams = () => professionList.map((profession) => ({ slug: profession.slug }));

/** Gold, rounded, for the hero counter. */
const gold = (copper: number, lang: Lang) => `${Math.round(copper / 10000).toLocaleString(professionsCopy[lang].numberLocale)} ${professionsCopy[lang].goldShort}`;

function levelingTotal(data: ProfessionData, prices: ProfessionPrices) {
  if (!Object.keys(prices).length) return null;
  const route = planRoute(data.recipes, data.items, prices);
  if (route.reached < data.maxSkill || !route.steps.length) return null;
  return shoppingList(route.steps, data.items, prices).reduce((sum, entry) => sum + (buyCost(entry, entry.qty, data.items, prices)?.total ?? 0), route.trainingCost);
}

const sum = (sources: ProfessionData["knowledge"]["weekly"]) => sources.reduce((total, s) => total + s.points * s.items.length, 0);

function RegionSwitch({ lang, slug, region, anchor }: { lang: Lang; slug: string; region: ProfessionRegion; anchor: string }) {
  const c = professionsCopy[lang];
  return <nav className={styles.regions} aria-label={c.region}>
    {PROFESSION_REGIONS.map((code) => <Link key={code} href={`${path(lang, slug)}${code === "eu" ? "" : `?region=${code}`}#${anchor}`} className={styles.region}
      aria-current={code === region ? "true" : undefined} scroll={false} prefetch={false}>{c.regions[code]}</Link>)}
  </nav>;
}

/** /wow/professions/<slug>: leveling at live prices, profitable crafts, trainer and knowledge, specializations. */
export async function ProfessionPage({ lang, slug, region: regionCode }: { lang: Lang; slug: string; region?: string }) {
  const data = await loadProfession(slug);
  if (!data) notFound();
  const c = professionsCopy[lang];
  const region = professionRegion(regionCode);
  const crafts = data.kind !== "gathering" && data.recipes.length > 3;
  const [{ prices }, records] = await Promise.all([loadProfessionPrices(data, region), crafts ? loadProfessionRecords(data, lang) : Promise.resolve({})]);
  const crafting = crafts;
  const total = crafting ? levelingTotal(data, prices) : null;
  const weekly = sum(data.knowledge.weekly.filter((s) => s.kind !== "gathering" && s.kind !== "disenchanting"));
  const oneTime = sum(data.knowledge.oneTime) + data.knowledge.treasures.reduce((t, x) => t + x.points, 0);
  const stats = [
    ...(total !== null ? [{ value: gold(total, lang), label: c.statLeveling }] : []),
    ...(weekly ? [{ value: String(weekly), label: c.statWeekly }] : []),
    ...(oneTime ? [{ value: String(oneTime), label: c.statOneTime }] : []),
  ];
  const gathered = (data.gathered ?? []).filter((id) => (data.items[id]?.ranks ?? [id]).some((rank) => prices[rank]));
  const hasKnowledge = data.knowledge.weekly.length + data.knowledge.oneTime.length + data.knowledge.treasures.length > 0;
  const others = professionList.filter((p) => p.slug !== slug);

  return <AtlasFrame lang={lang} scene="articles" className={styles.page} dataAttributes={{ "data-profession": data.slug }}>
    <div className={styles.accent} style={professionAccentStyle(data.slug)}>
    <AtlasHero align="start" className={styles.hero} eyebrow={`${c.eyebrow} · ${c.kinds[data.kind]}`} title={data.name[lang]} lede={c.lede[data.kind]}
      emblem={<span className={styles.emblem}><Image src={professionIconUrl(data.icon) ?? ""} alt="" width={56} height={56} unoptimized priority /></span>} stats={stats}
      breadcrumbs={trail(lang, "professions", { label: data.name[lang] })} breadcrumbsLabel={trailLabel(lang)} />

    {crafting ? <AtlasSection id="leveling" title={c.leveling} aside={<RegionSwitch lang={lang} slug={slug} region={region} anchor="leveling" />}>
      <ProfessionLeveling lang={lang} recipes={data.recipes} items={data.items} prices={prices} maxSkill={data.maxSkill} trainer={data.trainer}
        unlocks={specializationUnlocks(data.specializations)} currencies={data.currencies ?? {}} records={records} libraryOpen={runtimeFlags().catalogPublic} icon={data.icon} />
    </AtlasSection> : null}

    {crafting && Object.keys(prices).length ? <AtlasSection id="profit" title={c.profit}>
      <MaterialPlaque kit={PROFESSION_KIT} className={styles.plaque}><ProfessionProfits lang={lang} recipes={data.recipes} items={data.items} prices={prices} /></MaterialPlaque>
    </AtlasSection> : null}

    {gathered.length ? <AtlasSection id="gathered" title={c.gathered} aside={<RegionSwitch lang={lang} slug={slug} region={region} anchor="gathered" />}>
      <MaterialPlaque kit={PROFESSION_KIT} className={styles.plaque}>
        <div className={styles.tableScroll} role="group" aria-label={c.gatheredLabel} tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th scope="col">{c.item}</th><th scope="col" data-numeric>{c.min}</th><th scope="col" data-numeric>{c.median}</th><th scope="col" data-numeric>{c.listed}</th></tr></thead>
            <tbody>
              {gathered.flatMap((id) => {
                const item = data.items[id];
                return (item?.ranks ?? [id]).map((rank, index) => {
                  const price = prices[rank];
                  if (!price) return null;
                  return <tr key={rank}>
                    <th scope="row"><ProfessionItemLabel lang={lang} name={item?.name[lang] ?? null} icon={professionIconUrl(item?.icon)} quality={item?.quality ?? null} rank={item?.ranks ? index + 1 : null} /></th>
                    <td data-numeric><ProfessionMoney value={price.min} lang={lang} /></td>
                    <td data-numeric><ProfessionMoney value={price.median} lang={lang} /></td>
                    <td data-numeric>{price.quantity.toLocaleString(lang)}</td>
                  </tr>;
                });
              })}
            </tbody>
          </table>
        </div>
      </MaterialPlaque>
    </AtlasSection> : null}

    <AtlasSection id="knowledge" title={hasKnowledge ? `${c.trainer} · ${c.knowledge}` : c.trainer}>
      <MaterialPlaque kit={PROFESSION_KIT} className={styles.plaque}><ProfessionKnowledge data={data} lang={lang} /></MaterialPlaque>
    </AtlasSection>

    {data.specializations.length ? <AtlasSection id="specializations" title={c.specializations}>
      <ProfessionSpecializations data={data} lang={lang} />
    </AtlasSection> : null}

    <RelatedLinks label={relatedCopy[lang].label} links={(professionAuctionCategories[slug] ?? []).flatMap((key) => {
      const category = auctionCategory(key);
      return category ? [{ href: auctionCategoryHref(lang, key), label: `${relatedCopy[lang].auction}: ${auctionCategoryNames[lang][category.key]}`,
        icon: <Image src={auctionIconUrl(category.icon)} alt="" width={20} height={20} unoptimized loading="lazy" /> }] : [];
    })} />
    <nav className={styles.others} aria-label={c.otherProfessions}>
      {others.map((p) => <Link key={p.slug} href={path(lang, p.slug)} className={styles.otherLink}>
        <Image src={professionIconUrl(p.icon) ?? ""} alt="" width={24} height={24} unoptimized loading="lazy" />{p.name[lang]}
      </Link>)}
    </nav>
    </div>
  </AtlasFrame>;
}
