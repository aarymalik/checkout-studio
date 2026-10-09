"use client"

import * as RadixDialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * A modal dialog.
 *
 * Radix owns the parts that are easy to get wrong and hard to notice: focus
 * moves into the dialog on open and back to whatever opened it on close, the
 * page behind it is hidden from assistive technology, and Tab cannot leave.
 *
 * A title is required rather than optional. A dialog with no accessible name is
 * announced as "dialog", which tells a screen reader user that something has
 * taken over the page and nothing about what.
 *
 * See docs/design-system.md § Modals.
 */

export type DialogProps = ComponentPropsWithRef<typeof RadixDialog.Root>

export function Dialog(props: DialogProps) {
  return <RadixDialog.Root {...props} />
}

export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export interface DialogContentProps extends Omit<
  ComponentPropsWithRef<typeof RadixDialog.Content>,
  "title"
> {
  /** Announced as the dialog's name, and shown as its heading. */
  title: ReactNode
  /** Announced as the dialog's description. */
  description?: ReactNode
  /**
   * Whether clicking the backdrop closes the dialog.
   *
   * On by default and off for anything destructive: a misplaced click should
   * not be able to discard work, and docs/design-system.md says so. Escape and
   * the close button still work, so the reader is never trapped.
   */
  dismissOnClickOutside?: boolean
  size?: "sm" | "md" | "lg"
  /**
   * Whether the body carries the dialog's gutter. On by default.
   *
   * Off for a dialog whose content is meant to reach the edges — the command
   * palette's search field and its result rows. The header keeps its padding
   * either way, because a title flush against the corner is not a design
   * decision anybody made.
   */
  padded?: boolean
  children?: ReactNode
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const

export function DialogContent({
  className,
  title,
  description,
  dismissOnClickOutside = true,
  size = "md",
  padded = true,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-overlay",
          // Blur rather than a flat scrim: the page stays recognisable
          // underneath, so the dialog reads as layered over the work rather
          // than replacing it.
          "backdrop-blur-sm",
        )}
      />

      <RadixDialog.Content
        data-slot="dialog-content"
        onPointerDownOutside={(event) => {
          if (!dismissOnClickOutside) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (!dismissOnClickOutside) event.preventDefault()
        }}
        className={cn(
          // Inset rather than a calc: the dialog keeps a gutter on a narrow
          // screen without expressing its width as arithmetic on a raw length.
          "fixed inset-x-4 top-1/2 z-50 mx-auto -translate-y-1/2",
          SIZES[size],
          /*
           * Bounded, and scrollable past the bound.
           *
           * Without a height a dialog taller than the window overflows both
           * ends of it and neither can be reached: the top is clipped off
           * screen and the bottom is below the fold, with nothing to scroll
           * because the element is `fixed`. The shortcut reference is the
           * dialog that found this — forty shortcuts, of which a user could
           * read about twenty-five and no others, ever.
           *
           * design-system-ignore: a viewport-relative ceiling is not a spacing
           * step. The gutter either side of it is `inset-x-4`, which is.
           */
          "max-h-[90dvh] overflow-hidden",
          "flex flex-col",
          "rounded-modal border border-border bg-surface-raised shadow-dialog",
          "transition-opacity duration-normal ease-standard",
          "outline-none",
          className,
        )}
        {...props}
      >
        {/*
          The header keeps its padding whatever the body does.

          The command palette asked for an edge-to-edge search field and got it
          by setting `p-0` on the whole dialog, which took the title and the
          description to the edge with it — a heading flush against the corner
          with the close button sitting on top of the line below it.
        */}
        <div className="flex shrink-0 flex-col gap-1 px-6 pt-6 pb-4">
          <RadixDialog.Title className="text-h3 font-semibold text-foreground">
            {title}
          </RadixDialog.Title>

          {description === undefined ? null : (
            <RadixDialog.Description className="text-body text-foreground-muted">
              {description}
            </RadixDialog.Description>
          )}
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto",
            padded && "px-6 pb-6",
          )}
        >
          {children}
        </div>

        <RadixDialog.Close
          aria-label="Close"
          className={cn(
            /*
             * Absolute against the dialog, which no longer scrolls as a whole
             * — the body inside it does. A close button inside the scroller
             * would leave with the first screenful, and Escape would be the
             * only way out of a long dialog.
             */
            "absolute top-4 right-4 inline-flex size-8 items-center justify-center",
            "rounded-tight text-foreground-muted",
            "transition-colors duration-fast ease-standard outline-none",
            "hover:bg-surface-hover hover:text-foreground",
          )}
        >
          <X aria-hidden="true" className="size-4" />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

/** The row of actions at the bottom of a dialog. Primary action last. */
export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}
