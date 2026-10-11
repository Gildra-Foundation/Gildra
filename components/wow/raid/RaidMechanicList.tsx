import Image from "next/image";
import { CircleHelp, Crosshair, Footprints, Shield, Swords, Users } from "lucide-react";
import { AtlasBadge } from "@/components/atlas";
import { RaidDisclosure } from "./RaidDisclosure";
import type { RaidMechanic } from "./midnightRaidData";
import type { VoidspireBossGuide, VoidspireMechanic, VoidspireMechanicTag } from "./voidspireMechanicGuide";
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
  return (
    <li id={`mechanic-${mechanic.id}`} className={styles.mechanic} data-testid="voidspire-action-card">
      {mechanic.spell
        ? <Image className={styles.mechanicIcon} src={mechanic.spell.icon} alt="" width={48} height={48} />
        : <span className={styles.mechanicGlyph} aria-hidden="true"><FallbackIcon /></span>}
      <div className={styles.mechanicBody}>
        <div className={styles.mechanicHead}>
          <h3>
            {mechanic.name.en}
            {locale === "ru" && mechanic.name.ru !== mechanic.name.en ? <small lang="ru">{mechanic.name.ru}</small> : null}
          </h3>
          <div className={styles.mechanicTags}>
            {mechanic.tags.map((tag) => <AtlasBadge key={tag} tone="neutral">{copy.tags[tag]}</AtlasBadge>)}
          </div>
        </div>
        <p className={styles.mechanicWho}><b>{copy.who}:</b> {mechanic.who[locale]}</p>
        <p className={styles.mechanicAction}><strong>{copy.doThis}:</strong> {mechanic.action[locale]}</p>
        <RaidDisclosure summary={copy.more}>
          <dl className={styles.facts}>
            <div><dt>{copy.position}</dt><dd>{mechanic.position[locale]}</dd></div>
            <div><dt>{copy.timing}</dt><dd>{mechanic.timing[locale]}</dd></div>
            <div data-tone="failure"><dt>{copy.failure}</dt><dd>{mechanic.failure[locale]}</dd></div>
            <div><dt>{copy.difficulty}</dt><dd>{mechanic.difficulty[locale]}</dd></div>
          </dl>
          {journal ? (
            <p className={styles.journalNote}>
              <b>{copy.journal}:</b> {locale === "ru" ? journal.description : journal.descriptionEn}
            </p>
          ) : null}
          <p className={styles.mechanicSource}>
            {mechanic.spell
              ? <a href={wowheadSpell(mechanic.spell.id, locale)} target="_blank" rel="noreferrer">{copy.spellLink(mechanic.spell.id)}</a>
              : copy.spellPending}
          </p>
        </RaidDisclosure>
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
            {ability.nameEn}
            {locale === "ru" && ability.nameRu !== ability.nameEn ? <small lang="ru">{ability.nameRu}</small> : null}
          </h3>
          <div className={styles.mechanicTags}><AtlasBadge tone="neutral">{copy.roles[ability.role]}</AtlasBadge></div>
        </div>
        <p className={styles.mechanicText}>{locale === "ru" ? ability.description : ability.descriptionEn}</p>
        <p className={styles.mechanicSource}>
          {copy.journalSource(ability.descriptionBuild, ability.descriptionVerifiedAt)}
          {" · "}
          <a href={wowheadSpell(ability.spellId, locale)} target="_blank" rel="noreferrer">{copy.spellLink(ability.spellId)}</a>
        </p>
      </div>
    </li>
  );
}
