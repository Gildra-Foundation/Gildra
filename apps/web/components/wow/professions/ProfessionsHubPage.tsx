import Link from "next/link";
import type { Metadata } from "next";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { ProfessionIcon } from "./ProfessionParts";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { professionList } from "@/lib/wow/professions/data";
import { professionIconUrl } from "@/lib/wow/professions/leveling";
import type { ProfessionKind } from "@/lib/wow/professions/types";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";

type Lang = "en" | "ru";

export function professionsHubMetadata(lang: Lang): Metadata {
  const c = professionsCopy[lang];
  return { title: c.hubTitle, description: c.hubDescription, alternates: pairedAlternates(lang, "/wow/professions"),
    openGraph: pageOpenGraph(lang, { title: c.hubTitle, description: c.hubDescription, path: `${lang === "ru" ? "/ru" : ""}/wow/professions` }) };
}

const kinds: ProfessionKind[] = ["crafting", "gathering", "secondary"];

/** /wow/professions: the thirteen Midnight professions by kind. */
export function ProfessionsHubPage({ lang }: { lang: Lang }) {
  const c = professionsCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  return <AtlasFrame lang={lang} scene="articles" className={styles.page} dataAttributes={{ "data-professions-hub": true }}>
    <AtlasHero align="start" className={styles.hero} eyebrow={c.eyebrow} title={c.hubTitle} lede={c.hubLede} breadcrumbs={trail(lang, "professions")} breadcrumbsLabel={trailLabel(lang)} />
    {kinds.map((kind) => <AtlasSection key={kind} id={kind} title={c.kinds[kind]}>
      <ul className={styles.hubGrid}>
        {professionList.filter((p) => p.kind === kind).map((p) => <li key={p.slug}>
          <Link href={`${prefix}/wow/professions/${p.slug}`} className={styles.hubCard}>
            <ProfessionIcon url={professionIconUrl(p.icon)} size={56} />
            <span className={styles.hubName}>{p.name[lang]}</span>
          </Link>
        </li>)}
      </ul>
    </AtlasSection>)}
  </AtlasFrame>;
}
