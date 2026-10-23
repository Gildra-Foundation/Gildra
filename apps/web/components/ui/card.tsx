import type { ComponentPropsWithRef } from "react"
import {
  Card as ValyroCard,
  CardContent as ValyroCardContent,
  CardDescription,
  CardFooter as ValyroCardFooter,
  CardHeader as ValyroCardHeader,
  CardTitle,
} from "@gildra/atlas-ui/valyroParts"
import { cn } from "@/lib/utils"

type DivProps = ComponentPropsWithRef<"div">

/** shadcn's card layout (padded header, content and footer) on Valyro's Card. */
function Card(props: DivProps) {
  return <ValyroCard padding="none" {...props} />
}

function CardHeader({ className, ...props }: DivProps) {
  return <ValyroCardHeader className={cn("p-6", className)} {...props} />
}

function CardContent({ className, ...props }: DivProps) {
  return <ValyroCardContent className={cn("p-6 pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: DivProps) {
  return <ValyroCardFooter className={cn("flex items-center p-6 pt-0", className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
