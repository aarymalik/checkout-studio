import type { ComponentPropsWithRef } from "react"
import { cn } from "../lib/cn"

/**
 * A placeholder for content that has not arrived.
 *
 * Hidden from assistive technology: its shape is a hint about layout and says
 * nothing worth announcing. The region it stands in should carry `aria-busy`
 * so a screen reader hears that something is loading, rather than hearing a
 * row of empty boxes described one by one.
 *
 * The pulse is decorative, so it stops when a reader asks for reduced motion —
 * unlike the Spinner, whose motion is the only signal it has.
 */
export function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-skeleton rounded-tight bg-surface-sunken", className)}
      {...props}
    />
  )
}
