import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Search, Sparkles, X } from "lucide-react";
import { AtlasEmpty, AtlasError, AtlasField, AtlasInput, AtlasSelect, AtlasTable } from "@/components/atlas";
import { MaterialButton, MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import {
  armoryUrl, heroName, leaderboardClasses, leaderboardRegions, leaderboardRoleOf, leaderboardRoles, leaderboardSearch, leaderboardSpec,
  raiderIoUrl, realmName, talentsUrl,
  type LeaderboardEntry, type LeaderboardPage, type LeaderboardQuery, type LeaderboardRegion, type LeaderboardSpec,
} from "@/lib/games/wow/mplusLeaderboardView";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { LeaderboardForm } from "./LeaderboardClient";
import type { LeaderboardCopy } from "./leaderboardCopy";
import styles from "./leaderboard.module.css";

export type Locale = "en" | "ru";
/** Painted kits: the page wears Voidscar (as the meta page), one dungeon set per role. */
export const pageKit: DungeonSlug = "voidscar-arena";
export const roleKits = { tank: "den-of-nalorakk", healer: "the-blinding-vale", dps: "ruby-life-pools" } as const satisfies Record<string, DungeonSlug>;

const numberLocales = { en: "en-US", ru: "ru-RU" } as const;
export const formatScore = (value: number, locale: Locale) => value.toLocaleString(numberLocales[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatShare = (value: number, locale: Locale) => `${(value * 100).toLocaleString(numberLocales[locale], { maximumFractionDigits: 0 })}%`;
const nameKeys = { en: { spec: "specName", cls: "className" }, ru: { spec: "specNameRu", cls: "classNameRu" } } as const;
export const specName = (spec: LeaderboardSpec, locale: Locale) => spec.theme[nameKeys[locale].spec];
export const className = (spec: LeaderboardSpec, locale: Locale) => spec.theme[nameKeys[locale].cls];

/** Octagon spec icon in the class colour. */
export function SpecIcon({ spec, size = 32 }: { spec: LeaderboardSpec; size?: number }) {
  return (
    <span className={styles.octagon} style={{ "--class-color": spec.color, "--size": `${size}px` } as CSSProperties} aria-hidden="true">
      <Image src={spec.icon} alt="" width={size} height={size} sizes={`${size}px`} />
    </span>
  );
}

/** Name in the class colour (a link to the character in the Armory when `armory` is given), realm under it. */
export function PlayerName({ entry, locale, armory }: { entry: Pick<LeaderboardEntry, "name" | "realm" | "specId">; locale: Locale; armory?: { region: LeaderboardRegion; label: string } }) {
  const spec = leaderboardSpec(entry.specId);
  return (
    <span className={styles.player} style={{ "--class-color": spec?.color } as CSSProperties}>
      {armory
        ? <a className={styles.playerName} href={armoryUrl(armory.region, entry, locale)} target="_blank" rel="noreferrer" title={armory.label}>{entry.name}</a>
        : <b className={styles.playerName}>{entry.name}</b>}
      <span className={styles.realm}>{realmName(entry.realm, locale)}</span>
    </span>
  );
}

function SpecCell({ entry, locale, copy, heroOnly }: { entry: LeaderboardEntry; locale: Locale; copy: LeaderboardCopy; heroOnly: boolean }) {
  const spec = leaderboardSpec(entry.specId);
  if (!spec) return null;
  const hero = heroName(spec, entry.heroId, locale, entry.heroName);
  if (heroOnly) return hero ? <span className={styles.heroOnly}>{hero}</span> : <span aria-hidden="true">—</span>;
  return (
    <span className={styles.specCell}>
      <SpecIcon spec={spec} size={28} />
      <span className={styles.specText}>
        <span className={styles.specName} style={{ "--class-color": spec.color } as CSSProperties}>
          {specName(spec, locale)} <span className={styles.specClass}>{className(spec, locale)}</span>
        </span>
        {hero ? <span className={styles.heroTree}>{hero}</span> : null}
      </span>
      <span className={styles.srOnly}>{copy.roleOne[entry.role]}</span>
    </span>
  );
}

function ProfileLinks({ entry, region, copy, prefix }: { entry: LeaderboardEntry; region: LeaderboardRegion; copy: LeaderboardCopy; prefix: string }) {
  const spec = leaderboardSpec(entry.specId);
  return (
    <span className={styles.links}>
      {spec && entry.loadout ? (
        <a className={styles.linkIcon} href={talentsUrl(spec, entry.loadout, entry.heroId, prefix)} title={copy.openTalents(entry.name)} aria-label={copy.openTalents(entry.name)}>
          <Sparkles aria-hidden="true" />
        </a>
      ) : null}
      <a className={styles.linkIcon} href={raiderIoUrl(region, entry)} target="_blank" rel="noreferrer" title={copy.openRaiderIo(entry.name)} aria-label={copy.openRaiderIo(entry.name)}>
        <ExternalLink aria-hidden="true" />
      </a>
    </span>
  );
}

/** `fixedSpec`: the specialization page, where every row is the same spec and the column shows the hero tree only. */
export function LeaderboardTable({ page, locale, copy, prefix, fixedSpec = false }: { page: LeaderboardPage; locale: Locale; copy: LeaderboardCopy; prefix: string; fixedSpec?: boolean }) {
  if (!page.entries.length) return <p className={styles.noMatches}>{copy.noMatches}</p>;
  return (
    <AtlasTable
      className={styles.table}
      label={copy.tableLabel}
      rows={page.entries}
      rowKey={(entry) => `${entry.realm.slug}:${entry.name}`}
      columns={[
        { key: "rank", header: copy.rank, numeric: true, className: styles.rankCol, cell: (entry) => <span className={styles.rank} data-podium={entry.rank <= 3 || undefined}>{entry.rank}</span> },
        { key: "character", header: copy.character, rowHeader: true, cell: (entry) => <PlayerName entry={entry} locale={locale} armory={{ region: page.region, label: copy.openArmory(entry.name) }} /> },
        { key: "spec", header: <span className={styles.specHeader}>{fixedSpec ? copy.heroColumn : copy.specialization}</span>, label: fixedSpec ? copy.heroColumn : copy.specialization, className: fixedSpec ? styles.heroCol : styles.specCol, cell: (entry) => <SpecCell entry={entry} locale={locale} copy={copy} heroOnly={fixedSpec} /> },
        { key: "key", header: copy.key, label: copy.keyLabel, numeric: true, className: styles.keyCol, cell: (entry) => entry.key ? <span className={styles.key}>+{entry.key}</span> : <span aria-hidden="true">—</span> },
        { key: "score", header: copy.rating, label: copy.ratingLabel, numeric: true, cell: (entry) => <b className={styles.score}>{formatScore(entry.score, locale)}</b> },
        { key: "ilvl", header: copy.itemLevel, label: copy.itemLevelLabel, numeric: true, className: styles.ilvlCol, cell: (entry) => entry.itemLevel ?? <span aria-hidden="true">—</span> },
        { key: "links", header: <span className={styles.srOnly}>{copy.links}</span>, label: copy.links, className: styles.linksCol, cell: (entry) => <ProfileLinks entry={entry} region={page.region} copy={copy} prefix={prefix} /> },
      ]}
    />
  );
}

/** Region switch: plain links, the current one marked. */
export function RegionSwitch({ current, href, copy }: { current: LeaderboardRegion; href: (region: LeaderboardRegion) => string; copy: LeaderboardCopy }) {
  return (
    <nav className={styles.regions} aria-label={copy.regionsLabel}>
      {leaderboardRegions.map((region) => (
        <Link key={region} href={href(region)} className={styles.region} aria-current={region === current ? "page" : undefined} scroll={false}>
          <b>{region.toUpperCase()}</b><span>{copy.regions[region]}</span>
        </Link>
      ))}
    </nav>
  );
}

type FilterProps = {
  page: LeaderboardPage;
  query: LeaderboardQuery;
  action: string;
  locale: Locale;
  copy: LeaderboardCopy;
  /** The spec page fixes the specialization: only realm and name are offered. */
  fixedSpec?: boolean;
};

export function LeaderboardFilters({ page, query, action, locale, copy, fixedSpec = false }: FilterProps) {
  const specs = leaderboardClasses
    .filter((item) => !query.classId || item.classId === query.classId)
    .flatMap((item) => item.specs)
    .filter((spec) => !query.role || leaderboardRoleOf(spec.theme) === query.role);
  const realms = [...page.realms].sort((a, b) => realmName(a, locale).localeCompare(realmName(b, locale), locale));
  const active = Boolean(query.role || query.classId || (!fixedSpec && query.specId) || query.realm || query.q);
  return (
    <LeaderboardForm action={action} label={copy.filtersLabel} compact={fixedSpec}>
      {query.region !== "eu" ? <input type="hidden" name="region" value={query.region} /> : null}
      {!fixedSpec ? (
        <>
          <AtlasField label={copy.role} htmlFor="lb-role">
            <AtlasSelect id="lb-role" name="role" defaultValue={query.role ?? ""}>
              <option value="">{copy.anyRole}</option>
              {leaderboardRoles.map((role) => <option key={role} value={role}>{copy.roles[role]}</option>)}
            </AtlasSelect>
          </AtlasField>
          <AtlasField label={copy.class} htmlFor="lb-class">
            <AtlasSelect id="lb-class" name="class" defaultValue={query.classId ? String(query.classId) : ""}>
              <option value="">{copy.anyClass}</option>
              {leaderboardClasses.map((item) => <option key={item.classId} value={item.classId}>{locale === "ru" ? item.classNameRu : item.className}</option>)}
            </AtlasSelect>
          </AtlasField>
          <AtlasField label={copy.spec} htmlFor="lb-spec">
            <AtlasSelect id="lb-spec" name="spec" defaultValue={query.specId ? String(query.specId) : ""}>
              <option value="">{copy.anySpec}</option>
              {specs.map((spec) => <option key={spec.theme.specId} value={spec.theme.specId}>{specName(spec, locale)} · {className(spec, locale)}</option>)}
            </AtlasSelect>
          </AtlasField>
        </>
      ) : null}
      <AtlasField label={copy.realm} htmlFor="lb-realm">
        <AtlasSelect id="lb-realm" name="realm" defaultValue={query.realm ?? ""}>
          <option value="">{copy.anyRealm}</option>
          {realms.map((realm) => <option key={realm.slug} value={realm.slug}>{realmName(realm, locale)} ({realm.count})</option>)}
        </AtlasSelect>
      </AtlasField>
      <AtlasField label={copy.search} htmlFor="lb-q">
        <AtlasInput id="lb-q" name="q" type="search" defaultValue={query.q ?? ""} placeholder={copy.searchPlaceholder} icon={<Search aria-hidden="true" />} maxLength={40} autoComplete="off" />
      </AtlasField>
      <div className={styles.filterActions}>
        <MaterialButton kit={pageKit} type="submit" fit="block">{copy.apply}</MaterialButton>
        {active ? (
          <a className={styles.reset} href={`${action}${leaderboardSearch({ region: query.region })}#list`}>
            <X aria-hidden="true" />{copy.reset}
          </a>
        ) : null}
      </div>
    </LeaderboardForm>
  );
}

/** Paging as plain links (works without JavaScript): painted buttons of the page kit around "Page 2 of 10". */
export function LeaderboardPager({ page, query, action, copy }: { page: LeaderboardPage; query: LeaderboardQuery; action: string; copy: LeaderboardCopy }) {
  if (page.pages <= 1) return null;
  const at = (number: number) => `${action}${leaderboardSearch({ ...query, page: number })}#list`;
  return (
    <nav className={styles.pager} aria-label={copy.pagination}>
      {page.page > 1 ? <MaterialLinkButton kit={pageKit} href={at(page.page - 1)} icon={<ArrowLeft aria-hidden="true" />}>{copy.prev}</MaterialLinkButton> : <span />}
      <span className={styles.pagerStatus} aria-current="page">{copy.pageOf(page.page, page.pages)}</span>
      {page.page < page.pages ? <MaterialLinkButton kit={pageKit} href={at(page.page + 1)} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.next}</MaterialLinkButton> : <span />}
    </nav>
  );
}

export function LeaderboardState({ state, copy }: { state: "empty" | "error"; copy: LeaderboardCopy }) {
  return state === "error"
    ? <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
    : <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>;
}

/** Every class with links to its specializations' leaderboards. */
export function SpecDirectory({ region, locale, copy, prefix, current }: { region: LeaderboardRegion; locale: Locale; copy: LeaderboardCopy; prefix: string; current?: number }) {
  const suffix = leaderboardSearch({ region });
  return (
    <ul className={styles.directory} aria-label={copy.specsTitle}>
      {leaderboardClasses.map((item) => (
        <li key={item.classId} className={styles.directoryClass} style={{ "--class-color": item.color } as CSSProperties}>
          <span className={styles.directoryName}>{locale === "ru" ? item.classNameRu : item.className}</span>
          <span className={styles.directorySpecs}>
            {item.specs.map((spec) => (
              <Link key={spec.theme.specId} href={`${prefix}/wow/mythic-plus/leaderboard/${spec.theme.slug}${suffix}`} className={styles.directorySpec} aria-current={spec.theme.specId === current ? "page" : undefined}>
                <SpecIcon spec={spec} size={24} />
                <span>{specName(spec, locale)}</span>
              </Link>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
