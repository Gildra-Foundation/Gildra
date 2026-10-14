import { wowSourceName } from "@/lib/wow/sourceLocale";
import { ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection, AtlasTile } from "@/components/atlas";
import { contentManifest } from "@/lib/data/wow";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import styles from "./raidGuide.module.css";

type ManifestIdentity = { canonicalSlug: string; instance?: string; patch?: string; names: { en: string | null; ru: string | null }; sourceUrl?: string; lastVerifiedAt?: string };

const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const boss = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");

/** Honest placeholder for Sporefall and Rotmire: confirmed names, nothing else yet. */
export function SporefallPage({ locale, view }: { locale: RaidLocale; view: "raid" | "boss" }) {
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/sporefall`;
  if (!raid?.names.en || !raid.patch || !raid.sourceUrl || !raid.lastVerifiedAt || !boss?.names.en) {
    throw new Error("Sporefall identity projection is incomplete");
  }
  const crumbs = [{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.raids, href: `${prefix}/wow/raids` }];
  const isRaid = view === "raid";

  return (
    <AtlasFrame lang={locale} scene="sporefall">
      <AtlasHero
        breadcrumbs={isRaid ? [...crumbs, { label: wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined) }] : [...crumbs, { label: wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined), href: raidHref }, { label: wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined) }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblemShape={isRaid ? "circle" : "diamond"}
        eyebrow={isRaid ? <>{copy.season(1)} · {copy.patch(raid.patch)}</> : <>{wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined)} · {copy.encounterOf(1, 1)}</>}
        title={isRaid ? wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined) : wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined)}
        lede={isRaid ? copy.sporefallLede : copy.rotmireLede}
      />
      <AtlasSection>
        <div className={styles.stack}>
          <AtlasNotice
            tone="caution"
            icon={<Hourglass />}
            title={copy.pendingTitle}
            action={<AtlasLinkButton href={raid.sourceUrl} external variant="ghost" size="sm" iconAfter={<ExternalLink aria-hidden="true" />}>{copy.officialSource}</AtlasLinkButton>}
          >
            {copy.pendingText} {copy.verifiedOn(raid.lastVerifiedAt)}
          </AtlasNotice>
          {isRaid ? (
            <ol className={styles.pendingList}>
              <li><AtlasTile href={`${raidHref}/${boss.canonicalSlug}`} index="01" title={wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined)} text={copy.pendingBoss} /></li>
            </ol>
          ) : null}
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
