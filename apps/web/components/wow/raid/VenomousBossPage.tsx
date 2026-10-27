import Image from "next/image";
import { ExternalLink, HeartPulse, Shield, Swords } from "lucide-react";
import { AtlasDisclosure, AtlasFrame, AtlasHero, AtlasSection, AtlasTable } from "@/components/atlas";
import { difficulties, type BossGuide, type VerifiedAbilityIdentity } from "@/lib/data/wow";
import { wowGuideText } from "@/lib/wow/sourceLocale";
import { contentManifest } from "@/lib/data/wow";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import { lootBandIndexForBoss, raidLootBands, tierRewards, venomousRaidLootSource } from "./venomousAbyssIntel";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { venomousCopy } from "./venomousCopy";
import page from "./raidPage.module.css";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { getRaidReview } from "@/lib/data/raidReviews";
import { RaidHubBackdrop } from "./RaidHubBackdrop";
import { RaidPlaque, raidIconFrameStyle, raidMaterialStyles } from "./raidMaterial";
import { trail } from "@/lib/routes/registry";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } as const;

/** "Bloodlust: on pull" → label "Bloodlust", value "on pull". */
function labelled(text: string) {
  const split = text.indexOf(":");
  return split > 0 ? { label: text.slice(0, split), value: text.slice(split + 1).trim() } : { label: text, value: "" };
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\d]{4,}/gu) ?? []);
/** A reviewed tip that repeats a role task (most of its words already there) is not shown twice. */
function repeats(tip: string, tasks: string[]) {
  const own = words(tip);
  if (!own.size) return false;
  return tasks.some((task) => {
    const other = words(task);
    let shared = 0;
    for (const word of own) if (other.has(word)) shared += 1;
    return shared / own.size >= .4;
  });
}

/**
 * Boss page of The Venomous Abyss. Identity, journalAbilities and journalPhases
 * come from the verified Adventure Guide projection; everything with
 * strategyVerificationStatus "source_tracked" (summary, roles, timeline,
 * difficulty notes) is a third-party draft and is labelled as such.
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
  const named = boss.journalAbilities.filter((ability) => !ability.description);
  const lootBandIndex = lootBandIndexForBoss(boss.number);
  const tierReward = tierRewards[boss.slug];
  const review = getRaidReview("venomous-abyss");
  const reviewed = review?.bosses.find((entry) => entry.slug === boss.slug);
  const roleTasks = (["tank", "healer", "dps"] as const).flatMap((role) => boss.roles[role].map((item) => item[locale]));
  const tips = (reviewed ? (locale === "ru" ? reviewed.tipsRu : reviewed.tipsEn) : []).filter((tip) => !repeats(tip, roleTasks));
  const summary = reviewed ? (locale === "ru" ? reviewed.summaryRu : reviewed.summaryEn)
    : wowGuideText(boss.summary[locale].replace(/Nek[’']zali/g, boss.name[locale]), locale);
  const pull = labelled(wowGuideText(boss.pull[locale], locale));
  const sources = [...(reviewed?.sources ?? []), { title: copy.strategySource, url: boss.source }]
    .filter((source, index, all) => all.findIndex((entry) => entry.url === source.url) === index);

  return (
    <AtlasFrame lang={locale} still className={page.page} dataAttributes={{ "data-raid-page": "venomous-abyss" }}>
      <RaidHubBackdrop />
      <AtlasHero
        className={page.hero}
        breadcrumbs={trail(locale, "raids", { label: raidName, href: raidHref }, { label: boss.name[locale] })}
        breadcrumbsLabel={shared.breadcrumbsLabel}
        eyebrow={<>{raidName} · {shared.encounterOf(order + 1, bosses.length)}</>}
        title={boss.name[locale]}
        lede={boss.identityDescription[locale]}
        actions={<AtlasShareButton title={`${boss.name[locale]} — ${raidName}`} locale={locale} />}
      />

      <EncounterSwitcher items={encounters} label={shared.encountersLabel} />

      <AtlasSection id="plan" title={shared.planTitle} description={boss.type[locale]}>
        <p className={page.lead}>{summary}</p>
        <div className={page.roleGrid}>
          {(["tank", "healer", "dps"] as const).map((role) => {
            const RoleIcon = roleIcons[role];
            return (
              <RaidPlaque as="article" key={role} raid="venomous-abyss" className={page.plaque}>
                <h3 className={page.roleTitle}><RoleIcon aria-hidden="true" />{shared.roles[role]}</h3>
                <ul>{boss.roles[role].map((item) => <li key={item.en}>{wowGuideText(item[locale], locale)}</li>)}</ul>
              </RaidPlaque>
            );
          })}
        </div>
        <RaidPlaque raid="venomous-abyss" className={`${page.plaque} ${page.plaqueAfter}`}>
          <dl className={page.facts}>
            <div><dt>{copy.positioning}</dt><dd>{wowGuideText(boss.positioning[locale], locale)}</dd></div>
            <div><dt>{pull.label}</dt><dd>{pull.value}</dd></div>
          </dl>
          {tips.length ? <><h3 className={page.subheading}>{copy.beforePull}</h3><ul>{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></> : null}
        </RaidPlaque>
      </AtlasSection>

      <AtlasSection id="timeline" title={copy.timelineTitle} description={copy.timelineText}>
        <RaidPlaque raid="venomous-abyss" className={page.plaque}>
          <ol className={page.timeline}>
            {boss.timeline.map((event, index) => (
              <li key={`${event.marker}-${index}`}>
                <b>{event.marker === "INT" ? shared.tags.INTERRUPT : event.marker}</b>
                <strong>{wowGuideText(event.title[locale], locale)}</strong>
                <span>{wowGuideText(event.detail[locale], locale)}</span>
              </li>
            ))}
          </ol>
          {boss.journalPhases.length ? <p className={page.quiet}>{copy.journalPhases(boss.journalPhases.map((phase) => phase.name[locale]).join(" → "))}</p> : null}
        </RaidPlaque>
      </AtlasSection>

      <AtlasSection id="abilities" title={copy.abilitiesTitle}>
        <RaidPlaque raid="venomous-abyss" className={page.plaque}>
          <ul className={page.abilities} data-testid="verified-ability-list">
            {published.map((ability) => <AbilityRow key={ability.spellId} ability={ability} locale={locale} />)}
          </ul>
          {named.length ? (
            <ul className={page.abilityNames}>
              {named.map((ability) => (
                <li key={ability.spellId} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
                  <span className={raidMaterialStyles.iconFrame} style={raidIconFrameStyle("venomous-abyss", 44)}><Image src={ability.iconUrl} alt="" width={44} height={44} /></span>
                  <strong>{ability.name[locale]}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </RaidPlaque>
      </AtlasSection>

      <AtlasSection id="difficulty" title={copy.difficultyTitle}>
        <div className={page.roleGrid}>
          {difficulties.map((mode) => {
            const detail = boss.difficulty[mode];
            const comp = boss.composition[mode];
            return (
              <RaidPlaque as="article" key={mode} raid="venomous-abyss" className={page.plaque}>
                <p className={page.plaqueLabel}>{copy.difficultyNames[mode]}</p>
                <h3>{wowGuideText(detail.headline[locale], locale)}</h3>
                <ul>{detail.changes.map((change) => <li key={change.en}>{wowGuideText(change[locale], locale)}</li>)}</ul>
                <p className={page.meta}>{copy.composition(comp.tanks, comp.healers, comp.dps)}</p>
                <p>{wowGuideText(comp.note[locale], locale)}</p>
              </RaidPlaque>
            );
          })}
        </div>
      </AtlasSection>

      <AtlasSection id="loot" title={copy.rewardTitle} description={copy.rewardText}>
        <RaidPlaque raid="venomous-abyss" className={page.plaque}>
          <AtlasTable
            label={copy.rewardText}
            testId="encounter-loot-band"
            layout="cards"
            maxWidth="720px"
            rows={raidLootBands}
            rowKey={(row) => row.difficulty.en}
            columns={[
              { key: "difficulty", header: copy.difficulty, rowHeader: true, cell: (row) => row.difficulty[locale] },
              { key: "level", header: copy.itemLevel, numeric: true, cell: (row) => row.levels[lootBandIndex] },
              { key: "track", header: copy.track, cell: (row) => copy.tracks[row.track] },
            ]}
          />
          {tierReward ? <p className={page.meta}>{copy.tierReward}: <strong>{tierReward[locale]}</strong></p> : null}
          <p className={page.quiet}><a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{copy.lootSource}<ExternalLink aria-hidden="true" /></a></p>
        </RaidPlaque>
        <AtlasDisclosure summary={copy.sources}>
          <ul className={page.sourceList}>{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
        </AtlasDisclosure>
      </AtlasSection>

      <RaidPager label={shared.pagerLabel} back={{ href: raidHref, label: shared.allBosses(raidName) }} next={encounters[order + 1]} nextLabel={shared.nextBoss} />
    </AtlasFrame>
  );
}

function AbilityRow({ ability, locale }: { ability: VerifiedAbilityIdentity; locale: RaidLocale }) {
  return (
    <li className={page.ability} data-testid="verified-ability" data-spell-id={ability.spellId} data-description-status={ability.descriptionVerificationStatus}>
      <span className={raidMaterialStyles.iconFrame} style={raidIconFrameStyle("venomous-abyss", 52)}><Image src={ability.iconUrl} alt="" width={52} height={52} /></span>
      <div>
        <h3>{ability.name[locale]}</h3>
        {ability.description ? <p data-testid="verified-ability-description">{ability.description[locale]}</p> : null}
      </div>
    </li>
  );
}
