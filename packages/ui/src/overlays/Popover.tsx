import * as RadixPopover from "@radix-ui/react-popover"
import type { ComponentPropsWithRef } from "react"
import { cn } from "../lib/cn"

/**
 * A popover.
 *
 * For a small amount of interactive content anchored to a control — a colour
 * picker, a short form, a set of options too rich for a menu. Unlike a dialog it
 * does not take over the page: the work behind it stays visible and reachable,
 * which is the reason to use one.
 *
 * Focus moves in on open and back to the trigger on close, and Escape closes it.
 */
export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger
export const PopoverClose = RadixPopover.Close
export const PopoverAnchor = RadixPopover.Anchor

export interface PopoverContentProps extends ComponentPropsWithRef<typeof RadixPopover.Content> {
  /** Announced as the popover's name. A popover with no name is announced as nothing. */
  label: string
}

export function PopoverContent({
  className,
  label,
  align = "start",
  sideOffset = 6,
  ...props
}: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        data-slot="popover-content"
        aria-label={label}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-control border border-border bg-surface-raised p-4 shadow-dropdown",
          "outline-none",
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  )
}
