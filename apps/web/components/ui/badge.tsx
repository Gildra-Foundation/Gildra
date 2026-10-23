import type { ComponentPropsWithRef } from "react"
import { Badge as ValyroBadge, type BadgeColor, type BadgeVariant } from "@gildra/atlas-ui/valyroParts"

type Variant = "default" | "secondary" | "destructive" | "outline"

const looks: Record<Variant, { color: BadgeColor; variant: BadgeVariant }> = {
  default: { color: "amber", variant: "solid" },
  secondary: { color: "gray", variant: "subtle" },
  destructive: { color: "red", variant: "solid" },
  outline: { color: "gray", variant: "outline" },
}

export interface BadgeProps extends Omit<ComponentPropsWithRef<"span">, "color"> {
  variant?: Variant | null
}

/** shadcn's badge variants on Valyro's Badge. */
function Badge({ variant, ...props }: BadgeProps) {
  return <ValyroBadge {...looks[variant ?? "default"]} {...props} />
}

export { Badge }
