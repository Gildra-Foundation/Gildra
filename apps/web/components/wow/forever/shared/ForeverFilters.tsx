import { useId, type CSSProperties, type ComponentProps, type ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { AtlasField, AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "../foreverKit";
import { sharedCopy } from "./sharedCopy";
import styles from "./forever.module.css";

type Common = {
  lang: Lang;
  /** The name search (a <ForeverSearch>): the first row, with the action button beside it. */
  search?: ReactNode;
  /** The other fields: <ForeverSelect>, <ForeverLevel>, an <AtlasCheckbox>. */
  children?: ReactNode;
  /** The fields stand in the search's row while the panel is wide enough (up to three short fields). */
  inline?: boolean;
  className?: string;
};
type FormProps = Common & {
  /** Where the GET form goes (works without JavaScript; the filters live in the URL). */
  action: string;
  /** Label of the action button (default «Search» with a search field, «Apply» without). */
  submit?: string;
  /** Address without the filters; shown as «Reset» only while a filter is applied. */
  reset?: string;
  /** Values the form keeps as they are (the open tab, a relation). */
  hidden?: Record<string, string | undefined>;
  live?: never; onReset?: never; label?: never;
};
type LiveProps = Common & {
  /** Fields filter the list as the reader types (a client component owns the state): no form, no button. */
  live: true;
  /** Clears the state; shown as «Reset» only when given. */
  onReset?: () => void;
  /** Accessible name of a bar without a search field (settings of a tool): it is a group, not a search. */
  label?: string;
  action?: never; submit?: never; reset?: never; hidden?: never;
};

/**
 * The one filter bar of the section (on a <ForeverPanel>): the search with its sign and the painted
 * button, selects and level fields under it (or, `inline`, beside it), a quiet «Reset».
 */
export function ForeverFilters(props: FormProps | LiveProps) {
  const { lang, search, children, inline, className } = props;
  const t = sharedCopy[lang];
  const marks = { className: className ? `${styles.filters} ${className}` : styles.filters, "data-lead": search ? "" : undefined, "data-inline": inline && search ? "" : undefined };
  const lead = search ? <div className={styles.filterLead}>{search}</div> : null;
  const fields = children ? <div className={styles.filterFields}>{children}</div> : null;
  if (props.live) {
    return <div {...marks} role={search ? "search" : "group"} aria-label={props.label}>
      {lead}
      {fields}
      {props.onReset ? <button type="button" className={styles.filterReset} onClick={props.onReset}>{t.reset}</button> : null}
    </div>;
  }
  return <form {...marks} method="get" action={props.action} role="search">
    {Object.entries(props.hidden ?? {}).map(([name, value]) => value ? <input key={name} type="hidden" name={name} value={value} /> : null)}
    {lead}
    {fields}
    <div className={styles.filterAction}>
      <MaterialButton kit={FOREVER_KIT} type="submit" fit="stack" iconAfter={<ArrowRight aria-hidden="true" />}>{props.submit ?? (search ? t.search : t.apply)}</MaterialButton>
    </div>
    {props.reset ? <a className={styles.filterReset} href={props.reset}>{t.reset}</a> : null}
  </form>;
}

type InputProps = Omit<ComponentProps<"input">, "type" | "size" | "prefix">;

/** The name search: a label, the search sign and a hint of what can be typed («Item, spell, quest…»). */
export function ForeverSearch({ label, placeholder, id, className, ...input }: InputProps & { label: ReactNode; placeholder: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return <AtlasField label={label} htmlFor={fieldId} className={className ? `${styles.searchField} ${className}` : styles.searchField}>
    <AtlasInput id={fieldId} type="search" icon={<Search aria-hidden="true" />} placeholder={placeholder} maxLength={120} autoComplete="off" enterKeyHint="search" {...input} />
  </AtlasField>;
}

/** A level field: digits only, 1–60 unless the page says otherwise. */
export function ForeverLevel({ label, id, min = 1, max = 60, className, ...input }: InputProps & { label: ReactNode }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return <AtlasField label={label} htmlFor={fieldId} className={className ? `${styles.levelField} ${className}` : styles.levelField}>
    <AtlasInput id={fieldId} type="number" inputMode="numeric" min={min} max={max} placeholder={`${min}–${max}`} {...input} />
  </AtlasField>;
}

export type ForeverOption = { value: string | number; label: string };

/** Longer than this, a choice does not fit half of a phone's row: the list takes the whole row there. */
const WIDE_OPTION = 14;

/** A list of choices; the first option is the page's «All» / «Any». `width` (px) fits a list of short values (a level, a count). */
export function ForeverSelect({ label, options, width, id, className, ...select }: Omit<ComponentProps<"select">, "children"> & { label: ReactNode; options: readonly ForeverOption[]; width?: number }) {
  const auto = useId();
  const fieldId = id ?? auto;
  const wide = !width && options.some(option => option.label.length > WIDE_OPTION);
  // AtlasField takes no data attributes: the marks of the bar's layout sit on a wrapper.
  return <div className={className ? `${styles.selectField} ${className}` : styles.selectField}
    data-wide={wide ? "" : undefined} style={width ? { "--forever-field": `${width}px` } as CSSProperties : undefined}>
    <AtlasField label={label} htmlFor={fieldId}>
      <AtlasSelect id={fieldId} {...select}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</AtlasSelect>
    </AtlasField>
  </div>;
}
