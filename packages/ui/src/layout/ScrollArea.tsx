import * as RadixScrollArea from "@radix-ui/react-scroll-area"
import type { ComponentPropsWithRef } from "react"
import { cn } from "../lib/cn"

/**
 * A scrollable region with scrollbars that match the interface.
 *
 * Radix keeps native scrolling underneath, which is the point: a hand-built
 * scroller loses the wheel, the trackpad's momentum, keyboard paging and the
 * browser's own "scroll the focused element into view". Only the scrollbar is
 * ours.
 */
export interface ScrollAreaProps extends ComponentPropsWithRef<typeof RadixScrollArea.Root> {
  orientation?: "vertical" | "horizontal" | "both"
  /** Announced when the region is focusable, which it must be to be scrollable by keyboard. */
  label?: string
  viewportClassName?: string
}

export function ScrollArea({
  className,
  viewportClassName,
  orientation = "vertical",
  label,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root
      // Scrollbars stay visible while scrolling and fade after: permanently
      // hidden scrollbars hide the fact that there is more to read.
      type="hover"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <RadixScrollArea.Viewport
        // A scrollable region needs to be focusable, or a keyboard user cannot
        // scroll it at all. With a tabindex it needs a name and a role, so it
        // is announced as something scrollable rather than as a stray group.
        {...(label === undefined ? {} : { tabIndex: 0, role: "region", "aria-label": label })}
        className={cn("size-full rounded-[inherit] outline-none", viewportClassName)}
      >
        {children}
      </RadixScrollArea.Viewport>

      {orientation === "vertical" || orientation === "both" ? (
        <Scrollbar orientation="vertical" />
      ) : null}
      {orientation === "horizontal" || orientation === "both" ? (
        <Scrollbar orientation="horizontal" />
      ) : null}

      <RadixScrollArea.Corner />
    </RadixScrollArea.Root>
  )
}

function Scrollbar({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <RadixScrollArea.Scrollbar
      orientation={orientation}
      className={cn(
        // 12px with a 4px gutter: both on the spacing scale, and a wider bar
        // is easier to catch with a pointer than the 8px one this started as.
        "flex touch-none p-1 select-none",
        "transition-colors duration-fast ease-standard",
        orientation === "vertical" ? "w-3 flex-col" : "h-3 flex-row",
      )}
    >
      <RadixScrollArea.Thumb className="relative flex-1 rounded-pill bg-border-strong opacity-40 hover:opacity-70" />
    </RadixScrollArea.Scrollbar>
  )
}
