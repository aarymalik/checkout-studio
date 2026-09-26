import * as RadixContextMenu from "@radix-ui/react-context-menu"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { menuContentClassName, menuItemClassName } from "./DropdownMenu"
import { cn } from "../lib/cn"

/**
 * A right-click menu.
 *
 * Shares its appearance with the dropdown menu by sharing its class lists
 * rather than by looking similar: the two are the same menu reached two ways,
 * and a reader who learns one has learned the other.
 *
 * Also opens from the keyboard — Shift+F10 and the menu key — which is the part
 * that is usually missing, and the reason a right-click menu can otherwise hide
 * actions available nowhere else.
 */
export const ContextMenu = RadixContextMenu.Root
export const ContextMenuTrigger = RadixContextMenu.Trigger
export const ContextMenuGroup = RadixContextMenu.Group

export function ContextMenuContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixContextMenu.Content>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content
        data-slot="menu-content"
        className={cn(menuContentClassName, className)}
        {...props}
      />
    </RadixContextMenu.Portal>
  )
}

export interface ContextMenuItemProps extends ComponentPropsWithRef<typeof RadixContextMenu.Item> {
  icon?: ReactNode
  shortcut?: string
  destructive?: boolean
}

export function ContextMenuItem({
  className,
  icon,
  shortcut,
  destructive = false,
  children,
  ...props
}: ContextMenuItemProps) {
  return (
    <RadixContextMenu.Item
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
    </RadixContextMenu.Item>
  )
}

export function ContextMenuLabel({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixContextMenu.Label>) {
  return (
    <RadixContextMenu.Label
      className={cn("px-2 py-2 text-caption text-foreground-subtle", className)}
      {...props}
    />
  )
}

export function ContextMenuSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixContextMenu.Separator>) {
  return <RadixContextMenu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
}
