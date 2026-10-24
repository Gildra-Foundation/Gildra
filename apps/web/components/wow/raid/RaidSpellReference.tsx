import Image from "next/image";
import { AtlasDisclosure, AtlasSection } from "@/components/atlas";
import { getReviewedSpellIdentities, type ReviewedSpellIdentity } from "@/lib/data/raidReviews";
import { raidReviewCopy } from "./raidReviewCopy";
import styles from "./raidReview.module.css";

/** Identity and official artwork only: unresolved journal descriptions stay withheld. */
export function RaidSpellReference({ encounterId, raidSlug, bossSlug, exclude, locale, identities }: { encounterId?: number; raidSlug?: string; bossSlug?: string; exclude: number[]; locale: "ru" | "en"; identities?: ReviewedSpellIdentity[] }) {
  const reviewCopy = raidReviewCopy[locale];
  const abilities = getReviewedSpellIdentities(encounterId, raidSlug, bossSlug, identities).filter((ability) => !exclude.includes(ability.spellId));
  if (!abilities.length) return null;
  return (
    <AtlasSection id="spell-reference" title={reviewCopy.referenceTitle} description={reviewCopy.referenceText}>
      <AtlasDisclosure summary={`${reviewCopy.openAbilities} · ${abilities.length}`}>
        <ul className={styles.spells} data-testid="reviewed-spell-reference">{abilities.map((ability) => (
          <li key={ability.spellId} data-spell-id={ability.spellId}>
            <Image src={ability.iconUrl} alt="" width={40} height={40} />
            <a href={locale === "ru" ? ability.sourceUrlRu : ability.sourceUrlEn} target="_blank" rel="noreferrer">{locale === "ru" ? ability.nameRu : ability.nameEn}</a>
          </li>
        ))}</ul>
      </AtlasDisclosure>
    </AtlasSection>
  );
}
