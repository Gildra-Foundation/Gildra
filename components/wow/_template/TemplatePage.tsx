import { AtlasEmpty, AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { templateCopy } from "./templateCopy";
import styles from "./template.module.css";

export function TemplatePage({ locale }: { locale: "en" | "ru" }) {
  const copy = templateCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasFrame lang={locale} scene="archive">
      <AtlasHero
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.title }]}
        breadcrumbsLabel={copy.breadcrumbs}
        title={copy.title}
        lede={copy.lede}
      />
      <AtlasSection id="first" title={copy.sectionTitle}>
        <div className={styles.intro}>
          <AtlasEmpty title={copy.empty} />
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
