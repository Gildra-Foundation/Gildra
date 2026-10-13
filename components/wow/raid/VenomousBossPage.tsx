import Image from "next/image";
import { ExternalLink, Flame, HeartPulse, MapPin, Shield, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasMetaList, AtlasNotice, AtlasSection, AtlasTable } from "@/components/atlas";
import { difficulties, type BossGuide, type VerifiedAbilityIdentity } from "@/lib/data/wow";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import { lootBandIndexForBoss, raidLootBands, tierRewards, venomousRaidLootSource, venomousRaidVerifiedAt } from "./venomousAbyssIntel";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { venomousCopy } from "./venomousCopy";
import guide from "./raidGuide.module.css";
import styles from "./venomous.module.css";
import { AtlasShareButton } from "@/components/atlas/AtlasShareButton";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } as const;

/** "Bloodlust: on pull" → label "Bloodlust", value "on pull". */
function labelled(text: string) {
  const split = text.indexOf(":");
  return split > 0 ? { label: text.slice(0, split), value: text.slice(split + 1).trim() } : { label: text, value: "" };
}

/**
 * Boss page of The Venomous Abyss. Identity, journalAbilities and journalPhases
 * come from the verified Adventure Guide projection; everything with
 * strategyVerificationStatus "source_tracked" (summary, roles, timeline,
 * difficulty notes) is a third-party draft and is labelled as such.
 */
export function VenomousBossPage({ boss, bosses, locale }: { boss: BossGuide; bosses: BossGuide[]; locale: RaidLocale }) {
  const shared = raidGuideCopy[locale];
  const copy = venomousCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/venomous-abyss`;
  const order = bosses.indexOf(boss);
  const encounters = bosses.map((item) => ({ href: `${raidHref}/${item.slug}`, name: item.name.en, current: item.slug === boss.slug }));
  const published = boss.journalAbilities.filter((ability) => ability.description);
  const withheld = boss.journalAbilities.filter((ability) => !ability.description);
  const lootBandIndex = lootBandIndexForBoss(boss.number);
  const tierReward = tierRewards[boss.slug];
  const isDraft = boss.strategyVerificationStatus === "source_tracked";

  return (
    <AtlasFrame lang={locale} scene="venomousBoss">
      <AtlasHero
        breadcrumbs={[
          { label: shared.wow, href: `${prefix}/wow` },
          { label: shared.raids, href: `${prefix}/wow/raids` },
          { label: "The Venomous Abyss", href: raidHref },
          { label: boss.name.en },
        ]}
        breadcrumbsLabel={shared.breadcrumbsLabel}
        eyebrow={<>The Venomous Abyss · {shared.encounterOf(order + 1, bosses.length)}</>}
        title={boss.name.en}
        lede={boss.identityDescription[locale]}
        actions={<AtlasShareButton title={`${boss.name.en} — The Venomous Abyss`} locale={locale} />}
      />

      <EncounterSwitcher items={encounters} label={shared.encountersLabel} />

      {isDraft ? (
        <AtlasSection>
          <AtlasNotice
            tone="caution"
            title={copy.draftTitle}
            action={<AtlasLinkButton href={boss.source} external variant="ghost" size="sm" iconAfter={<ExternalLink aria-hidden="true" />}>{copy.strategySource}</AtlasLinkButton>}
          >
            {copy.draftText}
          </AtlasNotice>
        </AtlasSection>
      ) : null}

      <AtlasSection id="plan" title={shared.planTitle} description={boss.type[locale]}>
        <p className={styles.summary}>{boss.summary[locale]}</p>
        <div className={styles.roleGrid}>
          {(["tank", "healer", "dps"] as const).map((role) => {
            const RoleIcon = roleIcons[role];
            return (
              <article key={role} className={styles.role}>
                <h3><RoleIcon aria-hidden="true" />{shared.roles[role]}</h3>
                <ul>{boss.roles[role].map((item) => <li key={item.en}>{item[locale]}</li>)}</ul>
              </article>
            );
          })}
        </div>
        <AtlasMetaList columns={2} className={styles.planFacts} items={[
          { icon: <MapPin />, label: copy.positioning, value: boss.positioning[locale] },
          { icon: <Flame />, ...labelled(boss.pull[locale]) },
        ]} />
      </AtlasSection>

      <AtlasSection id="timeline" title={copy.timelineTitle} description={copy.timelineText}>
        <ol className={styles.timeline}>
          {boss.timeline.map((event, index) => (
            <li key={`${event.marker}-${index}`}>
              <span className={styles.marker}>{event.marker}</span>
              <span><strong>{event.title[locale]}</strong>{event.detail[locale]}</span>
            </li>
          ))}
        </ol>
        <p className={guide.sources}>
          {boss.journalPhases.length
            ? copy.journalPhases(boss.journalPhases.map((phase) => phase.name[locale]).join(" → "))
            : copy.noJournalPhases}
        </p>
      </AtlasSection>

      <AtlasSection id="abilities" title={copy.abilitiesTitle} description={copy.abilitiesText(published.length, boss.journalAbilities.length)}>
        <ul className={styles.abilities} data-testid="verified-ability-list">
          {published.map((ability) => <AbilityRow key={ability.spellId} ability={ability} locale={locale} />)}
        </ul>
        {withheld.length ? (
          <>
            <h3 className={styles.subheading}>{copy.withheldTitle}</h3>
            <ul className={styles.withheld}>
              {withheld.map((ability) => (
                <li key={ability.spellId} className={styles.chip} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
                  <Image src={ability.iconUrl} alt="" width={32} height={32} />
                  <span>
                    <strong>{ability.name.en}</strong>
                    {locale === "ru" && ability.name.ru !== ability.name.en ? <small lang="ru">{ability.name.ru}</small> : null}
                  </span>
                  <small className={styles.srOnly} data-testid="withheld-ability-description">{copy.withheldDescription}</small>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </AtlasSection>

      <AtlasSection id="difficulty" title={copy.difficultyTitle}>
        <div className={styles.difficultyGrid}>
          {difficulties.map((mode) => {
            const detail = boss.difficulty[mode];
            const comp = boss.composition[mode];
            return (
              <article key={mode} className={styles.difficulty}>
                <span className={styles.difficultyName}>{copy.difficultyNames[mode]}</span>
                <h3>{detail.headline[locale]}</h3>
                <ul>{detail.changes.map((change) => <li key={change.en}>{change[locale]}</li>)}</ul>
                <p className={styles.composition}><strong>{copy.composition(comp.tanks, comp.healers, comp.dps)}</strong>{comp.note[locale]}</p>
              </article>
            );
          })}
        </div>
      </AtlasSection>

      <AtlasSection id="loot" title={copy.rewardTitle} description={copy.rewardText}>
        <div className={styles.lootGrid}>
          <AtlasTable
            label={copy.rewardText}
            testId="encounter-loot-band"
            layout="cards"
            rows={raidLootBands}
            rowKey={(row) => row.difficulty.en}
            columns={[
              { key: "difficulty", header: copy.difficulty, rowHeader: true, cell: (row) => row.difficulty[locale] },
              { key: "level", header: copy.itemLevel, numeric: true, cell: (row) => row.levels[lootBandIndex] },
              { key: "track", header: copy.track, cell: (row) => row.track },
            ]}
          />
          <div className={styles.lootNotes}>
            {tierReward ? <p className={styles.tier}><span>{copy.tierReward}</span><strong>{tierReward[locale]}</strong></p> : null}
            <p className={styles.footnote}>
              {copy.rewardNote} <a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{copy.source}<ExternalLink aria-hidden="true" /></a> · {copy.checked(venomousRaidVerifiedAt)}
            </p>
          </div>
        </div>
      </AtlasSection>

      <RaidPager label={shared.encountersLabel} back={{ href: raidHref, label: shared.allBosses("The Venomous Abyss") }} next={encounters[order + 1]} nextLabel={shared.nextBoss} />
    </AtlasFrame>
  );
}

function AbilityRow({ ability, locale }: { ability: VerifiedAbilityIdentity; locale: RaidLocale }) {
  return (
    <li className={styles.ability} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
      <Image src={ability.iconUrl} alt="" width={44} height={44} />
      <div>
        <h3>
          {ability.name.en}
          {locale === "ru" && ability.name.ru !== ability.name.en ? <small lang="ru">{ability.name.ru}</small> : null}
        </h3>
        {ability.description ? <p data-testid="verified-ability-description">{ability.description[locale]}</p> : null}
      </div>
    </li>
  );
}
