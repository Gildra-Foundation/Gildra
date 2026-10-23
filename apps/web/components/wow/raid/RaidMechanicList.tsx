import { wowGuideText } from "@/lib/wow/sourceLocale";
import { sourceSpellNames } from "@/lib/wow/sourceSpellNames";
import Image from "next/image";
import { CircleHelp, Crosshair, Footprints, Shield, Swords, Users } from "lucide-react";
import { AtlasBadge, AtlasDisclosure } from "@/components/atlas";
import type { RaidMechanic } from "@/lib/data/wow/raid/midnightRaidData";
import type { VoidspireBossGuide, VoidspireMechanic, VoidspireMechanicTag } from "@/lib/data/wow/raid/voidspireMechanicGuide";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import styles from "./raidGuide.module.css";

const tagIcons: Partial<Record<VoidspireMechanicTag, typeof Footprints>> = {
  DODGE: Footprints,
  MOVE: Footprints,
  SPREAD: Footprints,
  INTERRUPT: Crosshair,
  STOP: Crosshair,
  HARD_CC: Crosshair,
  PURGE: Swords,
  TARGET_PRIORITY: Swords,
  DISPEL_MAGIC: Shield,
  TANK_SWAP: Shield,
  DEFENSIVE: Shield,
  SOAK: Users,
  STACK: Users,
};

const wowheadSpell = (spellId: number, locale: RaidLocale) => `https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}spell=${spellId}`;

/**
 * The one mechanics list of a boss guide. Guide mechanics (who / what to do, with
 * positioning, timing, failure and difficulty folded) come first; Adventure Guide
 * abilities that the guide does not cover follow with their verified description.
 */
export function RaidMechanicList({ guide, journal, locale }: { guide?: VoidspireBossGuide; journal: RaidMechanic[]; locale: RaidLocale }) {
  const journalBySpellId = new Map(journal.map((ability) => [ability.spellId, ability]));
  const coveredSpellIds = new Set(guide?.mechanics.flatMap((mechanic) => (mechanic.spell ? [mechanic.spell.id] : [])) ?? []);
  const journalOnly = journal.filter((ability) => !coveredSpellIds.has(ability.spellId));
  return (
    <ol className={styles.mechanics} data-testid="mechanic-list">
      {guide?.mechanics.map((mechanic) => (
        <GuideMechanic key={mechanic.id} mechanic={mechanic} journal={mechanic.spell ? journalBySpellId.get(mechanic.spell.id) : undefined} locale={locale} />
      ))}
      {journalOnly.map((ability) => <JournalAbility key={ability.spellId} ability={ability} locale={locale} />)}
    </ol>
  );
}

function GuideMechanic({ mechanic, journal, locale }: { mechanic: VoidspireMechanic; journal?: RaidMechanic; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const FallbackIcon = tagIcons[mechanic.tags[0]] ?? CircleHelp;
  // A spell without a confirmed name in this language keeps its original English name.
  const spellName = mechanic.spell ? sourceSpellNames[mechanic.spell.id]?.[locale] : undefined;
  const title = mechanic.preserveName ? mechanic.name[locale] : journal ? (locale === "ru" ? journal.nameRu : journal.nameEn) : mechanic.spell ? spellName ?? mechanic.name.en : mechanic.name[locale];
  const titleLang = !mechanic.preserveName && !journal && mechanic.spell && !spellName && locale === "ru" ? "en" : undefined;
  return (
    <li id={`mechanic-${mechanic.id}`} className={styles.mechanic} data-testid="voidspire-action-card">
      {mechanic.spell
        ? <Image className={styles.mechanicIcon} src={mechanic.spell.icon} alt="" width={48} height={48} />
        : <span className={styles.mechanicGlyph} aria-hidden="true"><FallbackIcon /></span>}
      <div className={styles.mechanicBody}>
        <div className={styles.mechanicHead}>
          <h3 lang={titleLang}>{title}</h3>
          <div className={styles.mechanicTags}>
            {mechanic.tags.map((tag) => <AtlasBadge key={tag} tone="neutral">{copy.tags[tag]}</AtlasBadge>)}
          </div>
        </div>
        <p className={styles.mechanicWho}><b>{copy.who}:</b> {wowGuideText(mechanic.who[locale], locale)}</p>
        <p className={styles.mechanicAction}><strong>{copy.doThis}:</strong> {wowGuideText(mechanic.action[locale], locale)}</p>
        <AtlasDisclosure summary={copy.more}>
          <dl className={styles.facts}>
            <div><dt>{copy.position}</dt><dd>{wowGuideText(mechanic.position[locale], locale)}</dd></div>
            <div><dt>{copy.timing}</dt><dd>{wowGuideText(mechanic.timing[locale], locale)}</dd></div>
            <div data-tone="failure"><dt>{copy.failure}</dt><dd>{wowGuideText(mechanic.failure[locale], locale)}</dd></div>
            <div><dt>{copy.difficulty}</dt><dd>{wowGuideText(mechanic.difficulty[locale], locale)}</dd></div>
          </dl>
          {journal ? (
            <p className={styles.journalNote}>
              <b>{copy.journal}:</b> {locale === "ru" ? journal.description : journal.descriptionEn}
            </p>
          ) : null}
          {mechanic.spell ? (
            <p className={styles.mechanicSource}>
              <a href={wowheadSpell(mechanic.spell.id, locale)} target="_blank" rel="noreferrer">{copy.wowheadLink}</a>
            </p>
          ) : null}
        </AtlasDisclosure>
      </div>
    </li>
  );
}

function JournalAbility({ ability, locale }: { ability: RaidMechanic; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  return (
    <li id={`spell-${ability.spellId}`} className={styles.mechanic}>
      <Image className={styles.mechanicIcon} src={ability.localIcon} alt="" width={48} height={48} />
      <div className={styles.mechanicBody}>
        <div className={styles.mechanicHead}>
          <h3>
            {locale === "ru" ? ability.nameRu : ability.nameEn}
          </h3>
          <div className={styles.mechanicTags}><AtlasBadge tone="neutral">{copy.roles[ability.role]}</AtlasBadge></div>
        </div>
        <p className={styles.mechanicText}>{locale === "ru" ? ability.description : ability.descriptionEn}</p>
        {/* Source and build are provenance, folded like the guide cards' details. */}
        <AtlasDisclosure summary={copy.more}>
          <p className={styles.mechanicSource}>
            {copy.journalSource(ability.descriptionBuild, ability.descriptionVerifiedAt)}
            {" · "}
            <a href={wowheadSpell(ability.spellId, locale)} target="_blank" rel="noreferrer">{copy.wowheadLink}</a>
          </p>
        </AtlasDisclosure>
      </div>
    </li>
  );
}
