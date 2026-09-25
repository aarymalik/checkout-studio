import * as RadixMenu from "@radix-ui/react-dropdown-menu"
import { Check } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * A dropdown menu.
 *
 * Compact, keyboard navigable, grouped into sections, icons on the left and
 * shortcuts on the right — docs/design-system.md § Context Menus, which the
 * dropdown follows so the two behave identically.
 *
 * Radix gives it typeahead, arrow-key navigation that skips disabled items, and
 * focus that returns to the trigger on close.
 */
export const DropdownMenu = RadixMenu.Root
export const DropdownMenuTrigger = RadixMenu.Trigger
export const DropdownMenuGroup = RadixMenu.Group
export const DropdownMenuSub = RadixMenu.Sub

/** Shared between the dropdown and the context menu, so the two cannot drift. */
export const menuContentClassName = cn(
  "z-50 min-w-48 overflow-hidden rounded-control p-1",
  "border border-border bg-surface-raised shadow-dropdown",
  "outline-none",
)

export const menuItemClassName = cn(
  "relative flex cursor-default items-center gap-2 rounded-tight px-2 py-2",
  "text-body text-foreground select-none outline-none",
  // Radix sets data-highlighted for the pointer and the keyboard alike, so
  // arrow keys look exactly like hover.
  "data-highlighted:bg-surface-hover",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
)

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        data-slot="menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(menuContentClassName, className)}
        {...props}
      />
    </RadixMenu.Portal>
  )
}

export interface DropdownMenuItemProps extends ComponentPropsWithRef<typeof RadixMenu.Item> {
  /** Shown on the left. Decorative: the label carries the meaning. */
  icon?: ReactNode
  /** Shown on the right, as a hint rather than as a binding. */
  shortcut?: string
  /** A destructive action, coloured and announced as one. */
  destructive?: boolean
}

export function DropdownMenuItem({
  className,
  icon,
  shortcut,
  destructive = false,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <RadixMenu.Item
      className={cn(
        menuItemClassName,
        destructive && "text-danger data-highlighted:bg-danger-subtle",
        className,
      )}
      {...props}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="flex size-4 items-center justify-center">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {shortcut === undefined ? null : (
        /*
         * Shown, not announced.
         *
         * Read aloud, "⌘D" is a pair of symbols rather than a shortcut, and it
         * lands in the middle of the item's name: "Duplicate⌘D". aria-keyshortcuts
         * is the mechanism for announcing a binding, and it takes a key name
         * rather than a glyph — so the hint stays visual, and the bindings
         * themselves are discoverable in the shortcuts reference
         * (docs/keyboard-shortcuts.md).
         */
        <span aria-hidden="true" className="text-caption text-foreground-subtle">
          {shortcut}
        </span>
      )}
    </RadixMenu.Item>
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.CheckboxItem>) {
  return (
    <RadixMenu.CheckboxItem className={cn(menuItemClassName, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <RadixMenu.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-primary" strokeWidth={3} />
        </RadixMenu.ItemIndicator>
      </span>
      {children}
    </RadixMenu.CheckboxItem>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.Label>) {
  return (
    <RadixMenu.Label
      className={cn("px-2 py-2 text-caption text-foreground-subtle", className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
}

export function DropdownMenuSubTrigger({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.SubTrigger>) {
  return <RadixMenu.SubTrigger className={cn(menuItemClassName, className)} {...props} />
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixMenu.SubContent>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.SubContent className={cn(menuContentClassName, className)} {...props} />
    </RadixMenu.Portal>
  )
}
