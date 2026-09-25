import * as RadixTooltip from "@radix-ui/react-tooltip"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * A tooltip.
 *
 * Supplementary only. A tooltip is not reachable by touch and is announced
 * inconsistently, so anything a reader needs in order to act belongs in the
 * interface itself — a tooltip is where the keyboard shortcut goes, not where
 * the button's meaning goes.
 *
 * Opens after a delay so that moving a pointer across a toolbar does not set off
 * a row of them, and closes immediately on Escape.
 *
 * See docs/design-system.md § Tooltips.
 */

/** Wraps the part of the tree that has tooltips in it. One per surface is enough. */
export function TooltipProvider({
  delayDuration = 400,
  disableHoverableContent = true,
  ...props
}: ComponentPropsWithRef<typeof RadixTooltip.Provider>) {
  return (
    <RadixTooltip.Provider
      delayDuration={delayDuration}
      // Nothing in one of our tooltips can be clicked, so there is no reason to
      // let the pointer move into it. Keeping it hoverable holds it on screen
      // over whatever it is covering, for a reader who has already read it.
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

export interface TooltipProps {
  /** What the tooltip says. Kept short: it is a label, not documentation. */
  content: ReactNode
  /** The keyboard shortcut for the action, shown after the label. */
  shortcut?: string
  side?: "top" | "right" | "bottom" | "left"
  /** The element the tooltip describes. Must be focusable to be reachable. */
  children: ReactNode
}

export function Tooltip({ content, shortcut, side = "top", children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 flex items-center gap-2 rounded-tight px-2 py-1",
            // Inverted: a tooltip sits above the interface and reads as a
            // different layer rather than as another panel.
            "bg-foreground text-foreground-inverse",
            "text-caption",
            "select-none",
          )}
        >
          {content}
          {shortcut === undefined ? null : (
            <span className="text-foreground-inverse opacity-60">{shortcut}</span>
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
