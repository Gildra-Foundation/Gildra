import { publicationFor } from "@/lib/wow/publication";
import { venomousActions } from "./venomousActions";
import Image from "next/image";
import { ExternalLink, Flame, HeartPulse, MapPin, Shield, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasAnchorNav, AtlasLinkButton, AtlasMetaList, AtlasNotice, AtlasSection, AtlasTable, AtlasTabs } from "@/components/atlas";
import { type BossGuide, type VerifiedAbilityIdentity } from "@/lib/data/wow";
import { wowGuideText } from "@/lib/wow/sourceLocale";
import { contentManifest } from "@/lib/data/wow";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import { lootBandIndexForBoss, raidLootBands, tierRewards, venomousRaidLootSource, venomousRaidLootVerifiedAt } from "./venomousAbyssIntel";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { venomousCopy } from "./venomousCopy";
import guide from "./raidGuide.module.css";
import styles from "./venomous.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { trail } from "@/lib/routes/registry";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } as const;

/** "Bloodlust: on pull" → label "Bloodlust", value "on pull". */
function labelled(text: string) {
  const split = text.indexOf(":");
  return split > 0 ? { label: text.slice(0, split), value: text.slice(split + 1).trim() } : { label: text, value: "" };
}

/**
 * Boss page of The Venomous Abyss. Identity, journalAbilities and journalPhases
 * come from the verified Adventure Guide projection; everything with
 * strategyVerificationStatus "source_tracked" uses cited author guides. The
 * publication manifest records completed editorial review independently of
 * exact-build spell-description verification. Unreviewed guides stay drafts.
 */
export function VenomousBossPage({ boss, bosses, locale }: { boss: BossGuide; bosses: BossGuide[]; locale: RaidLocale }) {
  const shared = raidGuideCopy[locale];
  const raidName = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss")?.names[locale] ?? "";
  const copy = venomousCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/venomous-abyss`;
  const order = bosses.indexOf(boss);
  const encounters = bosses.map((item) => ({ href: `${raidHref}/${item.slug}`, name: item.name[locale], current: item.slug === boss.slug }));
  const published = boss.journalAbilities.filter((ability) => ability.description);
  const withheld = boss.journalAbilities.filter((ability) => !ability.description);
  const lootBandIndex = lootBandIndexForBoss(boss.number);
  const tierReward = tierRewards[boss.slug];
  const loot = contentManifest.loot.filter(item => item.encounterSource === boss.slug);
  const publication = publicationFor(`/wow/raids/venomous-abyss/${boss.slug}`);
  const isDraft = !publication?.ready;

  return (
    <AtlasFrame lang={locale} scene="venomousBoss">
      <AtlasHero
        breadcrumbs={trail(locale, "raids", { label: raidName, href: raidHref }, { label: boss.name[locale] })}
        breadcrumbsLabel={shared.breadcrumbsLabel}
        eyebrow={<>{raidName} · {shared.encounterOf(order + 1, bosses.length)}</>}
        title={boss.name[locale]}
        lede={wowGuideText(boss.summary[locale], locale)}
        actions={<AtlasShareButton title={`${boss.name[locale]} — ${raidName}`} locale={locale} />}
      />

      {publication?.ready && <p className={styles.footnote}>{copy.checked(publication.verifiedAt!)} · {publication.sources.filter(url => /method.gg|icy-veins.com/.test(url)).map(url => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname.replace("www.", "")}<ExternalLink aria-hidden="true" /></a>)}</p>}
      <EncounterSwitcher items={encounters} label={shared.encountersLabel} />
      <AtlasAnchorNav label={copy.encounterContents} items={[
        { href: "#plan", label: shared.planTitle }, { href: "#timeline", label: copy.timelineTitle },
        { href: "#abilities", label: copy.abilitiesTitle }, { href: "#difficulty", label: copy.difficultyTitle },
        { href: "#loot", label: copy.rewardTitle },
      ]} />

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
        <div className={styles.roleGrid}>
          {(["tank", "healer", "dps"] as const).map((role) => {
            const RoleIcon = roleIcons[role];
            return (
              <article key={role} className={styles.role}>
                <h3><RoleIcon aria-hidden="true" />{shared.roles[role]}</h3>
                <ul>{boss.roles[role].map((item) => <li key={item.en}>{wowGuideText(item[locale], locale)}</li>)}</ul>
              </article>
            );
          })}
        </div>
        <AtlasMetaList columns={2} className={styles.planFacts} items={[
          { icon: <MapPin />, label: copy.positioning, value: wowGuideText(boss.positioning[locale], locale) },
          { icon: <Flame />, ...labelled(wowGuideText(boss.pull[locale], locale)) },
        ]} />
      </AtlasSection>

      <AtlasSection id="timeline" title={copy.timelineTitle} description={copy.timelineText}>
        <ol className={styles.timeline}>
          {boss.timeline.map((event, index) => (
            <li key={`${event.marker === "INT" ? (copy.intermission) : event.marker}-${index}`}>
              <span className={styles.marker}>{event.marker === "INT" ? (copy.intermission) : event.marker}</span>
              <span><strong>{wowGuideText(event.title[locale], locale)}</strong>{wowGuideText(event.detail[locale], locale)}</span>
            </li>
          ))}
        </ol>
        <p className={guide.sources}>
          {boss.journalPhases.length
            ? copy.journalPhases(boss.journalPhases.map((phase) => phase.name[locale]).join(" → "))
            : copy.noJournalPhases}
        </p>
      </AtlasSection>

      <AtlasSection id="abilities" title={copy.abilitiesTitle} description={copy.abilitiesDescription}>
        <ul className={styles.abilities} data-testid="verified-ability-list">
          {published.map((ability) => <AbilityRow key={ability.spellId} ability={ability} locale={locale} />)}
        </ul>
        {withheld.length ? (
          <>
            <h3 className={styles.subheading}>{copy.responseTitle}</h3>
            <p className={styles.footnote}>{copy.editorialAdvice}</p>
            <ul className={styles.abilities}>
              {withheld.map((ability) => (
                <li key={ability.spellId} className={styles.ability} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
                  <Image src={ability.iconUrl} alt="" width={32} height={32} />
                  <div>
                    <h3><a href={`https://www.wowhead.com/spell=${ability.spellId}`} target="_blank" rel="noreferrer">{ability.name[locale]}</a></h3>
                    {locale === "ru" && <small>{ability.name.en}</small>}
                    {venomousActions[ability.spellId] && <p>{venomousActions[ability.spellId][locale]}</p>}
                  </div>
                  <small className={styles.srOnly} data-testid="withheld-ability-description">{copy.withheldDescription}</small>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </AtlasSection>

      <AtlasSection id="difficulty" title={copy.difficultyTitle}>
        <AtlasTabs label={copy.difficultyTitle} tabs={(["normal", "heroic"] as const).map(mode => ({
          id: mode, label: copy.difficultyNames[mode], content: <article className={styles.difficulty}>
            <h3>{wowGuideText(boss.difficulty[mode].headline[locale], locale)}</h3>
            <ul>{boss.difficulty[mode].changes.map(change => <li key={change.en}>{wowGuideText(change[locale], locale)}</li>)}</ul>
            <p className={styles.composition}><strong>{copy.composition(boss.composition[mode].tanks, boss.composition[mode].healers, boss.composition[mode].dps)}</strong>{wowGuideText(boss.composition[mode].note[locale], locale)}</p>
          </article>
        }))} />
      </AtlasSection>

      <AtlasSection id="loot" title={copy.rewardTitle} description={copy.rewardText}>
        <AtlasTable
          label={copy.bossDrops}
          layout="cards"
          rows={loot}
          rowKey={item => String(item.itemId)}
          columns={[
            { key: "item", header: copy.item, rowHeader: true, cell: item => <a href={item.itemUrl} target="_blank" rel="noreferrer">{item.names[locale]}<ExternalLink size={14} aria-hidden="true" /></a> },
            { key: "slot", header: copy.type, cell: item => item.slot[locale] },
            { key: "normal", header: copy.difficultyNames.normal, numeric: true, cell: item => item.itemLevel?.normal ?? "—" },
            { key: "heroic", header: copy.difficultyNames.heroic, numeric: true, cell: item => item.itemLevel?.heroic ?? "—" },
            ...(loot.some(item => item.note[locale]) ? [{ key: "note", header: copy.note, cell: (item: (typeof loot)[number]) => item.note[locale] || "—" }] : []),
          ]}
        />
        <p className={styles.footnote}>{copy.lootFootnote}</p>
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
              { key: "track", header: copy.track, cell: (row) => copy.tracks[row.track] },
            ]}
          />
          <div className={styles.lootNotes}>
            {tierReward ? <p className={styles.tier}><span>{copy.tierReward}</span><strong>{tierReward[locale]}</strong></p> : null}
            <p className={styles.footnote}>
              {copy.rewardNote} <a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{copy.source}<ExternalLink aria-hidden="true" /></a> · {copy.checked(venomousRaidLootVerifiedAt)}
            </p>
          </div>
        </div>
      </AtlasSection>

      <RaidPager label={shared.pagerLabel} back={{ href: raidHref, label: shared.allBosses(raidName) }} next={encounters[order + 1]} nextLabel={shared.nextBoss} />
    </AtlasFrame>
  );
}

function AbilityRow({ ability, locale }: { ability: VerifiedAbilityIdentity; locale: RaidLocale }) {
  return (
    <li className={styles.ability} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
      <Image src={ability.iconUrl} alt="" width={44} height={44} />
      <div>
        <h3>
          {ability.name[locale]}
        </h3>
        {ability.description ? <p data-testid="verified-ability-description">{ability.description[locale]}</p> : null}
      </div>
    </li>
  );
}
