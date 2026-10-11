import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import styles from "./AtlasButton.module.css";

type Variant = "primary" | "secondary" | "ghost";
type Common = { children: ReactNode; variant?: Variant; icon?: ReactNode; iconAfter?: ReactNode; className?: string; size?: "md" | "sm" };

/** Link styled as an atlas action. External links open in the same tab unless `external`. */
export function AtlasLinkButton({ href, external, children, variant = "secondary", icon, iconAfter, className, size = "md", prefetch }: Common & { href: string; external?: boolean; prefetch?: boolean }) {
  const classes = clsx(styles.button, styles[variant], styles[size], className);
  const content = <>{icon}<span>{children}</span>{iconAfter}</>;
  if (external) return <a className={classes} href={href} target="_blank" rel="noreferrer">{content}</a>;
  return <Link className={classes} href={href} prefetch={prefetch}>{content}</Link>;
}

/** Button styled as an atlas action. */
export function AtlasButton({ children, variant = "secondary", icon, iconAfter, className, size = "md", type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={clsx(styles.button, styles[variant], styles[size], className)} {...rest}>{icon}<span>{children}</span>{iconAfter}</button>;
}
