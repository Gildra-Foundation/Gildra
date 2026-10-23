import { Button as ValyroButton, type ButtonProps as ValyroButtonProps, type ButtonVariant } from "@gildra/atlas-ui/valyroParts"

type Variant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type Size = "default" | "sm" | "lg" | "icon"

const variants: Record<Variant, ButtonVariant> = { default: "primary", destructive: "danger", outline: "secondary", secondary: "secondary", ghost: "ghost", link: "link" }

export interface ButtonProps extends Omit<ValyroButtonProps, "variant" | "size"> {
  variant?: Variant | null
  size?: Size | null
}

/** The API console's button: shadcn's variant and size names on Valyro's Button. */
function Button({ variant, size, ...props }: ButtonProps) {
  return <ValyroButton variant={variants[variant ?? "default"]} size={size === "sm" ? "sm" : size === "lg" ? "lg" : "md"} data-icon-only={size === "icon" || undefined} {...props} />
}

export { Button }
