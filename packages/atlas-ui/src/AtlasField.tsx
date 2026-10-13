import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./AtlasField.module.css";

/**
 * Form controls of the atlas (database filters, search, calculators): native
 * elements on atlas tokens, so they work in server components and plain GET
 * forms. `AtlasField` adds the label, a hint and an error line.
 */
export function AtlasField({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={clsx(styles.field, error ? styles.invalid : null, className)}>
      <label className={styles.label} htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className={styles.error} role="alert">{error}</p> : hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

/** Text, search or number input; `icon` sits at the start (search glass). */
export function AtlasInput({ icon, className, ...props }: ComponentProps<"input"> & { icon?: ReactNode }) {
  return (
    <span className={clsx(styles.inputWrap, icon ? styles.withIcon : null, className)}>
      {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
      <input className={styles.input} {...props} />
    </span>
  );
}

export function AtlasSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={clsx(styles.selectWrap, className)}>
      <select className={styles.select} {...props}>{children}</select>
    </span>
  );
}

export function AtlasCheckbox({ label, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className={clsx(styles.check, className)}>
      <input type="checkbox" className={styles.checkInput} {...props} />
      <span className={styles.box} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function AtlasRange({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="range" className={clsx(styles.range, className)} {...props} />;
}
