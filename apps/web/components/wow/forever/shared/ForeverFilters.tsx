import { Children, useId, type CSSProperties, type ComponentProps, type ReactNode } from "react";
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
  /** The other fields: <ForeverSelect>, <ForeverLevel>. */
  children?: ReactNode;
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
  live?: never; onReset?: never;
};
type LiveProps = Common & {
  /** Fields filter the list as the reader types (a client component owns the state): no form, no button. */
  live: true;
  /** Clears the state; shown as «Reset» only when given. */
  onReset?: () => void;
  action?: never; submit?: never; reset?: never; hidden?: never;
};

/**
 * The one filter bar of the section (on a <ForeverPanel>): the search with its sign and
 * the painted button in the first row, selects and level fields in a row under it, a quiet «Reset».
 */
export function ForeverFilters(props: FormProps | LiveProps) {
  const { lang, search, children, className } = props;
  const t = sharedCopy[lang];
  const fields = children ? <div className={styles.filterFields} style={{ "--forever-fields": Children.toArray(children).length } as CSSProperties}>{children}</div> : null;
  const classes = className ? `${styles.filters} ${className}` : styles.filters;
  if (props.live) {
    return <div className={classes} role="search" data-lead={search ? "" : undefined}>
      {search ? <div className={styles.filterLead}>{search}</div> : null}
      {fields}
      {props.onReset ? <button type="button" className={styles.filterReset} onClick={props.onReset}>{t.reset}</button> : null}
    </div>;
  }
  const button = <MaterialButton kit={FOREVER_KIT} type="submit" fit="stack" iconAfter={<ArrowRight aria-hidden="true" />}>{props.submit ?? (search ? t.search : t.apply)}</MaterialButton>;
  return <form className={classes} method="get" action={props.action} role="search" data-lead={search ? "" : undefined}>
    {Object.entries(props.hidden ?? {}).map(([name, value]) => value ? <input key={name} type="hidden" name={name} value={value} /> : null)}
    {search ? <div className={styles.filterLead}>{search}{button}</div> : null}
    {search ? fields : <div className={styles.filterLead}>{fields}{button}</div>}
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

/** A list of choices; the first option is the page's «All» / «Any». */
export function ForeverSelect({ label, options, id, className, ...select }: Omit<ComponentProps<"select">, "children"> & { label: ReactNode; options: readonly ForeverOption[] }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return <AtlasField label={label} htmlFor={fieldId} className={className}>
    <AtlasSelect id={fieldId} {...select}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</AtlasSelect>
  </AtlasField>;
}
