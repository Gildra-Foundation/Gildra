import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { AtlasSection } from "@/components/atlas";
import { getReviewedSpellIdentities } from "@/lib/data/raidReviews";
import { raidReviewCopy } from "./raidReviewCopy";
import { RaidPlaque, raidIconFrameStyle, raidMaterialStyles } from "./raidMaterial";
import type { RaidHubSlug } from "./raidHubData";
import page from "./raidPage.module.css";

/** The encounter's abilities by name and official icon in painted skill frames; each name links to its tooltip. */
export function RaidSpellReference({ raid, encounterId, raidSlug, bossSlug, exclude, locale }: { raid: RaidHubSlug; encounterId?: number; raidSlug?: string; bossSlug?: string; exclude: number[]; locale: "ru" | "en" }) {
  const reviewCopy = raidReviewCopy[locale];
  const abilities = getReviewedSpellIdentities(encounterId, raidSlug, bossSlug).filter((ability) => !exclude.includes(ability.spellId));
  if (!abilities.length) return null;
  return (
    <AtlasSection id="spell-reference" title={reviewCopy.referenceTitle}>
      <RaidPlaque raid={raid} className={page.plaque}>
        <ul className={page.abilityNames} data-testid="reviewed-spell-reference">{abilities.map((ability) => (
          <li key={ability.spellId} data-spell-id={ability.spellId}>
            <span className={raidMaterialStyles.iconFrame} style={raidIconFrameStyle(raid, 44)}><Image src={ability.iconUrl} alt="" width={44} height={44} /></span>
            <a href={locale === "ru" ? ability.sourceUrlRu : ability.sourceUrlEn} target="_blank" rel="noreferrer">{locale === "ru" ? ability.nameRu : ability.nameEn}<ExternalLink aria-hidden="true" /></a>
          </li>
        ))}</ul>
      </RaidPlaque>
    </AtlasSection>
  );
}
