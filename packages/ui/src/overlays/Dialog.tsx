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
          "flex flex-col gap-4",
          "rounded-modal border border-border bg-surface-raised p-6 shadow-dialog",
          "transition-opacity duration-normal ease-standard",
          "outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1">
          <RadixDialog.Title className="text-h3 font-semibold text-foreground">
            {title}
          </RadixDialog.Title>

          {description === undefined ? null : (
            <RadixDialog.Description className="text-body text-foreground-muted">
              {description}
            </RadixDialog.Description>
          )}
        </div>

        {children}

        <RadixDialog.Close
          aria-label="Close"
          className={cn(
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
