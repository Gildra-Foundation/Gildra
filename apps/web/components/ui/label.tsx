import type { ComponentPropsWithRef } from "react"
import { cn } from "@/lib/utils"

/** A native label in shadcn's label style. */
function Label({ className, ...props }: ComponentPropsWithRef<"label">) {
  return <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
}

export { Label }
