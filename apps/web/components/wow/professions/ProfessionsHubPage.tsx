import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { TrendingUp } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { ProfessionIcon, ProfessionMoney } from "./ProfessionParts";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { loadProfessionHubFacts, professionList, type ProfessionHubFacts } from "@/lib/wow/professions/data";
import { professionIconUrl } from "@/lib/wow/professions/leveling";
import type { ProfessionKind } from "@/lib/wow/professions/types";
import { PROFESSION_KIT, professionAccentStyle } from "./professionKit";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";
import { seoTitles } from "@/lib/seo/titles";
import { JsonLd, itemListLd } from "@/lib/seo/jsonld";
import Image from "next/image";
import { RelatedLinks } from "@/components/wow/shared/RelatedLinks";
import { auctionCategoryHref, relatedCopy } from "@/components/wow/shared/relatedLinksCopy";
import { auctionCategories, auctionCategoryNames, auctionIconUrl } from "@/lib/wow/auctionMarketCategories";

type Lang = "en" | "ru";

export function professionsHubMetadata(lang: Lang): Metadata {
  const c = professionsCopy[lang];
  const title = seoTitles.professions[lang];
  return { title, description: c.hubDescription, alternates: pairedAlternates(lang, "/wow/professions"),
    openGraph: pageOpenGraph(lang, { title, description: c.hubDescription, path: `${lang === "ru" ? "/ru" : ""}/wow/professions` }) };
}

const kinds: ProfessionKind[] = ["crafting", "gathering", "secondary"];

/** /wow/professions: the thirteen Midnight professions by kind, each with its leveling cost and best profit right now. */
export async function ProfessionsHubPage({ lang }: { lang: Lang }) {
  await connection();
  const c = professionsCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const facts = new Map<string, ProfessionHubFacts>((await loadProfessionHubFacts("eu")).map((f) => [f.slug, f]));
  return <AtlasFrame lang={lang} scene="articles" className={styles.page} dataAttributes={{ "data-professions-hub": true }}>
    <JsonLd data={itemListLd(c.hubTitle, professionList.map((profession) => ({ name: profession.name[lang], href: `${prefix}/wow/professions/${profession.slug}` })), false)} />
    <AtlasHero align="start" className={styles.hero} eyebrow={c.eyebrow} title={c.hubTitle} lede={c.hubLede} breadcrumbs={trail(lang, "professions")} breadcrumbsLabel={trailLabel(lang)} />
    {kinds.map((kind) => <AtlasSection key={kind} id={kind} title={c.kinds[kind]}>
      <ul className={styles.hubGrid}>
        {professionList.filter((p) => p.kind === kind).map((p) => {
          const f = facts.get(p.slug);
          const href = `${prefix}/wow/professions/${p.slug}`;
          return <li key={p.slug} style={professionAccentStyle(p.slug)}>
            <MaterialPlaque kit={PROFESSION_KIT} as="article" className={styles.hubCard} aria-labelledby={`profession-${p.slug}`}>
              <Link href={href} className={styles.hubIcon} aria-hidden="true" tabIndex={-1}><ProfessionIcon url={professionIconUrl(p.icon)} size={64} /></Link>
              <div className={styles.hubHead}>
                <h3 className={styles.hubName} id={`profession-${p.slug}`}><Link href={href}>{p.name[lang]}</Link></h3>
                {f?.leveling ? <p className={styles.hubCost}><span className={styles.hubLabel}>{c.hubCost}</span><ProfessionMoney value={Math.round(f.leveling / 10000) * 10000} lang={lang} /></p> : null}
              </div>
              {f?.best ? <p className={styles.hubBest}>
                <TrendingUp size={14} aria-hidden="true" />
                <span className={styles.hubLabel}>{f.best.kind === "craft" ? c.hubBest : c.hubTop}</span>
                <span className={styles.hubBestName}>{f.best.name[lang]}</span>
                <span className={styles.hubBestValue}>{f.best.kind === "craft" ? "+" : ""}<ProfessionMoney value={Math.round(f.best.value / 100) * 100} lang={lang} /></span>
              </p> : null}
            </MaterialPlaque>
          </li>;
        })}
      </ul>
    </AtlasSection>)}
    <RelatedLinks label={relatedCopy[lang].label} links={auctionCategories.filter((category) => category.group === "materials").slice(0, 6).map((category) => ({
      href: auctionCategoryHref(lang, category.key), label: `${relatedCopy[lang].auction}: ${auctionCategoryNames[lang][category.key]}`,
      icon: <Image src={auctionIconUrl(category.icon)} alt="" width={20} height={20} unoptimized loading="lazy" />,
    }))} />
  </AtlasFrame>;
}
