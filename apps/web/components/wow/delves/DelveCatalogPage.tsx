import { wowSourceName, wowSourceNameLang } from "@/lib/wow/sourceLocale";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, materialStyles, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { midnightDelves } from "@/lib/data/wow";
import { trail } from "@/lib/routes/registry";
import { delveCatalogCopy } from "./delveCatalogCopy";
import styles from "./delveCatalog.module.css";

/** Delves have no kit of their own yet: they wear the mossy stone and old bronze of Altar of Fangs. */
const kit: MaterialKit = "altar-of-fangs";

/** The delve atlas: the current season on a painted plaque, the first season as a quiet index. */
export function DelveCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const text = delveCatalogCopy[locale];
  const current = midnightDelves.filter((delve) => delve.season === "midnight-season-2");
  const archive = midnightDelves.filter((delve) => delve.season === "midnight-season-1");
  const name = (value: string) => <span lang={wowSourceNameLang(value, locale)}>{wowSourceName(value, locale)}</span>;
  return (
    <AtlasFrame lang={locale} scene="delves">
      <AtlasHero
        breadcrumbs={trail(locale, "delves")}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
        actions={<MaterialLinkButton kit={kit} fit="stack" href="#season-2" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{text.choose}</MaterialLinkButton>}
        statsLabel={text.statsLabel}
        stats={[{ value: current.length, label: text.season2Count }, { value: archive.length, label: text.season1Count }]}
      />
      <AtlasSection id="season-2" title={text.season2} description={text.season2Text}>
        <MaterialPlaque kit={kit} className={styles.plaque}>
          <ol className={styles.current}>
            {current.map((delve) => <li key={delve.id} className={materialStyles.title}>{name(delve.name)}</li>)}
          </ol>
        </MaterialPlaque>
      </AtlasSection>
      <AtlasSection id="season-1" title={text.season1}>
        <ol className={styles.index}>
          {archive.map((delve) => <li key={delve.id}>{name(delve.name)}</li>)}
        </ol>
      </AtlasSection>
      <p className={styles.source}>
        {text.source}:{" "}
        <a href={current[0]?.sourceUrl} target="_blank" rel="noreferrer">{text.season2Source}<ArrowUpRight aria-hidden="true" /></a>
        {" · "}
        <a href={archive[0]?.sourceUrl} target="_blank" rel="noreferrer">{text.season1Source}<ArrowUpRight aria-hidden="true" /></a>
      </p>
    </AtlasFrame>
  );
}
