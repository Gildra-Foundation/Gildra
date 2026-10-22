import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "./valyro-ui/basic/Button";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasButton.module.css";

type Variant = "primary" | "secondary" | "ghost";
type Common = { children: ReactNode; variant?: Variant; icon?: ReactNode; iconAfter?: ReactNode; className?: string; size?: "md" | "sm" };

/** Valyro's Slot keeps a real Next Link / external anchor, with no nested button. */
export function AtlasLinkButton({ href, external, children, variant = "secondary", icon, iconAfter, className, size = "md", prefetch }: Common & { href: string; external?: boolean; prefetch?: boolean }) {
  return <Button asChild variant={variant} size={size} leftIcon={icon} rightIcon={iconAfter} className={clsx(bridge.scope, styles.button, className)}>
    {external
      ? <a href={href} target="_blank" rel="noreferrer">{children}</a>
      : <Link href={href} prefetch={prefetch}>{children}</Link>}
  </Button>;
}

/** Shared Valyro action, preserving the atlas API and native button attributes. */
export function AtlasButton({ children, variant = "secondary", icon, iconAfter, className, size = "md", type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button type={type} variant={variant} size={size} leftIcon={icon} rightIcon={iconAfter} className={clsx(bridge.scope, styles.button, className)} {...rest}>{children}</Button>;
}
