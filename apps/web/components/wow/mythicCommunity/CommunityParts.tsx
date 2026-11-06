import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, HeartPulse, Shield, Swords, X } from "lucide-react";
import { AtlasEmpty, AtlasError, AtlasField, AtlasNotice, AtlasSelect } from "@/components/atlas";
import { MaterialButton, MaterialPlaque, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { classColors } from "@/lib/atlas/dataPalette";
import { specIcon } from "@/lib/games/wow/assets";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { runsRegions, runsSearch, type RunsEnvelope, type RunsGroup, type RunsLoad, type RunsQuery, type RunsRole, type RunsSpec } from "@/lib/games/wow/mythicPlusRunsTypes";
import type { CommunityCopy } from "./communityCopy";
import styles from "./community.module.css";

export type Locale = "en" | "ru";
export const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords } satisfies Record<RunsRole, unknown>;

const themes = new Map(talentSpecThemes.map((theme) => [theme.specId, theme]));

/** Display data of a spec id: English names (game terms stay English), class colour, local icon. */
export type SpecView = { id: number; role: RunsRole; specName: string; className: string; color: string; icon: string | null };
export function specView(spec: RunsSpec): SpecView {
  const theme = themes.get(spec.id);
  const specName = theme?.specName ?? spec.spec_name;
  return {
    id: spec.id,
    role: spec.role,
    specName,
    className: theme?.className ?? spec.class_name,
    color: classColors[spec.class_slug as keyof typeof classColors] ?? "var(--atlas-text-muted)",
    icon: specIcon(specName, spec.class_slug, spec.spec_slug),
  };
}
export function specIndex(specs: RunsSpec[]) {
  return new Map(specs.map((spec) => [spec.id, specView(spec)]));
}
export const specLabel = (spec: SpecView | undefined) => (spec ? `${spec.specName} ${spec.className}` : "");

export const number = (value: number, locale: Locale, digits = 0) =>
  value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const percent = (value: number, locale: Locale) => `${number(value, locale, 1)}%`;
/** A share of runs: a spec seen in a handful of runs reads "<0.1%", never "0%". */
export const shareOf = (value: number, runs: number, locale: Locale) => (runs > 0 && value < 0.1 ? `<${number(0.1, locale, 1)}%` : percent(value, locale));

/** Octagon spec icon in its class colour; with `name`, the spec and class name beside it. */
export function SpecToken({ spec, size = "md", name = true }: { spec: SpecView | undefined; size?: "sm" | "md" | "lg"; name?: boolean }) {
  if (!spec) return null;
  const px = size === "lg" ? 52 : size === "sm" ? 28 : 36;
  return (
    <span className={styles.spec} data-size={size} style={{ "--class-color": spec.color } as CSSProperties} title={name ? undefined : specLabel(spec)}>
      <span className={styles.octagon} aria-hidden="true">
        {spec.icon ? <Image src={spec.icon} alt="" width={px} height={px} sizes={`${px}px`} /> : null}
      </span>
      {name ? (
        <span className={styles.specText}>
          <span className={styles.specName} lang="en">{spec.specName}</span>
          <span className={styles.className} lang="en">{spec.className}</span>
        </span>
      ) : <span className={styles.srOnly} lang="en">{specLabel(spec)}</span>}
    </span>
  );
}

/** The five icons of a group in role order: tank, healer, three damage dealers. */
export function GroupIcons({ group, specs }: { group: RunsGroup; specs: Map<number, SpecView> }) {
  const ids = [group.tank, group.healer, ...group.dps];
  return (
    <span className={styles.group}>
      {ids.map((id, index) => <SpecToken key={`${id}-${index}`} spec={specs.get(id)} size="sm" name={false} />)}
    </span>
  );
}

/** Filter form of the community pages: a plain GET form, so the state lives in the URL and works without script. */
export function FilterForm({ id, kit, data, query, copy, action, fields, extra }: {
  id: string;
  kit: MaterialKit;
  data: RunsEnvelope | null;
  query: RunsQuery;
  copy: CommunityCopy;
  action: string;
  fields: Array<"dungeon" | "region" | "minLevel">;
  extra?: ReactNode;
}) {
  const levels = data ? range(data.levelRange.min + 1, data.levelRange.max) : [];
  if (query.minLevel && !levels.includes(query.minLevel)) levels.push(query.minLevel);
  levels.sort((a, b) => a - b);
  const active = Boolean(query.dungeon || query.region || query.minLevel || query.specs?.length || query.sort);
  return (
    <MaterialPlaque kit={kit} className={styles.filterPlaque}>
    <form method="get" action={action} className={styles.filters} aria-label={copy.filters} id={id}>
      {query.specs?.length ? <input type="hidden" name="specs" value={query.specs.join(",")} /> : null}
      {fields.includes("dungeon") ? (
        <AtlasField label={copy.dungeon} htmlFor={`${id}-dungeon`}>
          <AtlasSelect id={`${id}-dungeon`} name="dungeon" defaultValue={query.dungeon ?? ""}>
            <option value="">{copy.allDungeons}</option>
            {(data?.dungeons ?? []).map((dungeon) => <option key={dungeon.slug} value={dungeon.slug} lang="en">{dungeon.name}</option>)}
          </AtlasSelect>
        </AtlasField>
      ) : null}
      {fields.includes("region") ? (
        <AtlasField label={copy.region} htmlFor={`${id}-region`}>
          <AtlasSelect id={`${id}-region`} name="region" defaultValue={query.region ?? ""}>
            <option value="">{copy.regions.all}</option>
            {runsRegions.map((region) => <option key={region} value={region}>{copy.regions[region]}</option>)}
          </AtlasSelect>
        </AtlasField>
      ) : null}
      {fields.includes("minLevel") ? (
        <AtlasField label={copy.minLevel} htmlFor={`${id}-level`}>
          <AtlasSelect id={`${id}-level`} name="minLevel" defaultValue={query.minLevel ? String(query.minLevel) : ""}>
            <option value="">{copy.anyLevel}</option>
            {levels.map((level) => <option key={level} value={level}>{copy.level(level)}</option>)}
          </AtlasSelect>
        </AtlasField>
      ) : null}
      {extra}
      <span className={styles.filterActions}>
        <MaterialButton kit={kit} type="submit" className={styles.applyButton} data-filter-apply>{copy.apply}</MaterialButton>
        {active ? <a className={styles.resetLink} href={action}>{copy.reset}</a> : null}
      </span>
    </form>
    </MaterialPlaque>
  );
}

function range(from: number, to: number) {
  const list: number[] = [];
  for (let level = from; level <= to; level += 1) list.push(level);
  return list;
}

export const hrefWith = (base: string, query: RunsQuery) => `${base}${runsSearch(query)}`;

/** Empty / error / invalid states inside a plaque of the page kit. */
export function LoadState({ result, kit, copy, resetHref }: { result: RunsLoad<unknown>; kit: MaterialKit; copy: CommunityCopy; resetHref: string }) {
  return (
    <MaterialPlaque kit={kit} className={styles.state}>
      {result.state === "error"
        ? <AtlasError title={copy.errorTitle}>{copy.error}</AtlasError>
        : result.state === "invalid"
          ? <AtlasEmpty title={copy.invalidTitle} action={<a className={styles.resetLink} href={resetHref}>{copy.reset}</a>}>{copy.invalid}</AtlasEmpty>
          : <AtlasEmpty title={copy.emptyTitle}>{copy.empty}</AtlasEmpty>}
    </MaterialPlaque>
  );
}

export function NoMatch({ copy, resetHref }: { copy: CommunityCopy; resetHref: string }) {
  return <AtlasEmpty title={copy.noMatchTitle} action={<a className={styles.resetLink} href={resetHref}>{copy.reset}</a>}>{copy.noMatch}</AtlasEmpty>;
}

export function StaleNotice({ data, copy }: { data: RunsEnvelope; copy: CommunityCopy }) {
  return data.status === "stale" ? <AtlasNotice tone="caution">{copy.stale}</AtlasNotice> : null;
}

/** The one attribution line Raider.IO asks for, plus the way back to the hub. */
export function SourceLine({ copy, hubHref, kit }: { copy: CommunityCopy; hubHref: string; kit: MaterialKit }) {
  return (
    <MaterialPlaque kit={kit} as="footer" className={styles.source}>
      <span>{copy.source}: <a href="https://raider.io" rel="noreferrer" target="_blank">Raider.IO<ArrowUpRight aria-hidden="true" /></a></span>
      <a className={styles.hubLink} href={hubHref}><ArrowLeft aria-hidden="true" />{copy.backToHub}</a>
    </MaterialPlaque>
  );
}

/** A selected spec with a link that removes it. */
export function SelectedSpec({ spec, href, copy }: { spec: SpecView | undefined; href: string; copy: CommunityCopy }) {
  if (!spec) return null;
  return (
    <a className={styles.chosen} href={href} aria-label={copy.remove(specLabel(spec))} style={{ "--class-color": spec.color } as CSSProperties}>
      <SpecToken spec={spec} size="md" />
      <X aria-hidden="true" className={styles.chosenX} />
    </a>
  );
}
