import { ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection, AtlasTile } from "@/components/atlas";
import contentManifest from "@/data/wow/content-manifest.json";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import styles from "./raidGuide.module.css";

type ManifestIdentity = { canonicalSlug: string; instance?: string; patch?: string; names: { en: string | null }; sourceUrl?: string; lastVerifiedAt?: string };

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
    <AtlasFrame lang={locale} art="/assets/wow/loading/raid-wow-optimized.webp" artPosition="center 40%" tint="rgba(122, 64, 196, .2)">
      <AtlasHero
        breadcrumbs={isRaid ? [...crumbs, { label: raid.names.en }] : [...crumbs, { label: raid.names.en, href: raidHref }, { label: boss.names.en }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblemShape={isRaid ? "circle" : "diamond"}
        eyebrow={isRaid ? <>{copy.season(1)} · {copy.patch(raid.patch)}</> : <>{raid.names.en} · {copy.encounterOf(1, 1)}</>}
        title={isRaid ? raid.names.en : boss.names.en}
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
              <li><AtlasTile href={`${raidHref}/${boss.canonicalSlug}`} index="01" title={boss.names.en} text={copy.pendingBoss} /></li>
            </ol>
          ) : null}
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
