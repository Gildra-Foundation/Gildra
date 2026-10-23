import { Children, isValidElement, type ComponentPropsWithRef } from "react"
import { Alert as ValyroAlert, AlertDescription, AlertTitle } from "@gildra/atlas-ui/valyroParts"

export interface AlertProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  variant?: "default" | "destructive" | null
}

/**
 * shadcn's `<Alert><Icon /><AlertTitle /><AlertDescription /></Alert>` on Valyro's
 * Alert: the leading icon element becomes the alert's icon, the parts its title
 * and description.
 */
function Alert({ variant, children, ...props }: AlertProps) {
  const items = Children.toArray(children)
  const icon = items.find((child) => isValidElement(child) && child.type !== AlertTitle && child.type !== AlertDescription)
  return (
    <ValyroAlert variant={variant === "destructive" ? "danger" : "info"} icon={icon ?? null} {...props}>
      {items.filter((child) => child !== icon)}
    </ValyroAlert>
  )
}

export { Alert, AlertTitle, AlertDescription }
