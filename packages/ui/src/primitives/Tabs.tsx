import * as RadixTabs from "@radix-ui/react-tabs"
import type { ComponentPropsWithRef } from "react"
import { cn } from "../lib/cn"

/**
 * Tabs.
 *
 * Radix keeps the roving tab order right: one Tab stop reaches the list, arrow
 * keys move between tabs, and the panel is reachable next. Tabbing through every
 * tab in turn — which is what a set of buttons gives you — makes a panelled
 * interface unusable with a keyboard.
 *
 * Activation follows focus by default, which is what a sighted keyboard user
 * expects. A tab whose panel is expensive to render should set
 * `activationMode="manual"` instead of making every arrow key press pay for it.
 */
export const Tabs = RadixTabs.Root

export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("inline-flex items-center gap-1 border-b border-border", className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px inline-flex items-center gap-2 px-3 py-2",
        "text-body text-foreground-muted",
        "transition-colors duration-fast ease-standard outline-none",
        "hover:text-foreground",
        // The active tab is marked by a line and by weight, not by colour
        // alone: an underline survives both a colour-blind reader and a
        // greyscale print.
        "data-[state=active]:font-medium data-[state=active]:text-foreground",
        "data-[state=active]:border-b-2 data-[state=active]:border-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export function TabsPanel({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("pt-4 outline-none", className)} {...props} />
}
