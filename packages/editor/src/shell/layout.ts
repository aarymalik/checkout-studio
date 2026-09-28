import { LAYOUT, clampWidth } from "@checkout-studio/design-system"

/**
 * The frame's arrangement, as a person left it.
 *
 * Stored per user and restored on any device, so the editor opens the way they
 * work rather than the way it shipped. Everything here is answerable from the
 * layout alone — nothing about the document belongs in it.
 *
 * See docs/ui-guidelines.md § Panels.
 */

/** The left sidebar's tabs, in the order they are shown. */
export const SIDEBAR_TABS = [
  "components",
  "layers",
  "pages",
  "assets",
  "templates",
  "theme",
] as const

export type SidebarTabId = (typeof SIDEBAR_TABS)[number]

export interface ShellLayout {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
  /** Which left tab is showing. Restored, because people live in one of them. */
  sidebarTab: SidebarTabId
}

export const DEFAULT_LAYOUT: ShellLayout = {
  leftWidth: LAYOUT.left.default,
  rightWidth: LAYOUT.right.default,
  leftCollapsed: false,
  rightCollapsed: false,
  sidebarTab: "components",
}

function isSidebarTab(value: unknown): value is SidebarTabId {
  return typeof value === "string" && (SIDEBAR_TABS as readonly string[]).includes(value)
}

function width(value: unknown, bounds: typeof LAYOUT.left): number {
  return typeof value === "number" ? clampWidth(value, bounds) : bounds.default
}

function flag(value: unknown): boolean {
  return value === true
}

/**
 * A stored layout, made safe to render.
 *
 * Deliberately tolerant: a row written by an older version of the product is
 * the ordinary case, not corruption. Every field falls back on its own, so a
 * layout that has gained a panel since it was saved still restores the widths
 * it does know about.
 */
export function normalizeLayout(value: unknown): ShellLayout {
  if (typeof value !== "object" || value === null) return DEFAULT_LAYOUT

  const stored = value as Record<string, unknown>

  return {
    leftWidth: width(stored["leftWidth"], LAYOUT.left),
    rightWidth: width(stored["rightWidth"], LAYOUT.right),
    leftCollapsed: flag(stored["leftCollapsed"]),
    rightCollapsed: flag(stored["rightCollapsed"]),
    sidebarTab: isSidebarTab(stored["sidebarTab"])
      ? stored["sidebarTab"]
      : DEFAULT_LAYOUT.sidebarTab,
  }
}

/** Whether two layouts differ, so an unchanged one is never written back. */
export function layoutsEqual(a: ShellLayout, b: ShellLayout): boolean {
  return (
    a.leftWidth === b.leftWidth &&
    a.rightWidth === b.rightWidth &&
    a.leftCollapsed === b.leftCollapsed &&
    a.rightCollapsed === b.rightCollapsed &&
    a.sidebarTab === b.sidebarTab
  )
}
