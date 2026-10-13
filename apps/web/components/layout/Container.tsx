import type { ReactNode } from "react";

/** Page-width content column (`.section`); `route` adds `.route-section`
 *  padding for pages without a hero. */
export function Container({
  variant = "default",
  className,
  children,
}: {
  variant?: "default" | "route";
  /** Extra classes appended to `.section` (e.g. "specpage", "legal"). */
  className?: string;
  children: ReactNode;
}) {
  const base = variant === "route" ? "section route-section" : "section";
  return <div className={className ? `${base} ${className}` : base}>{children}</div>;
}
