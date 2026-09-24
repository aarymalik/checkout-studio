import type { StaticSemanticName } from "./semantics"
import type { ColorSemanticName } from "./semantics"

/**
 * Tier 3 — component tokens.
 *
 * Component-scoped bindings, used where a component needs to deviate
 * coherently rather than arbitrarily. Every one resolves to a semantic, never
 * to a primitive: a component token that reached past the semantic tier would
 * stop responding to a mode switch.
 *
 * Three hops is the limit — component token → semantic → primitive. A fourth
 * hop is a design smell (docs/theme-system.md § Token Tiers).
 *
 * Panel widths and the toolbar height are semantics rather than component
 * tokens: a component token that only aliases the semantic of the same name
 * adds a hop and a chance to collide, and buys nothing.
 */
export const componentTokens = {
  "button-primary-bg": "color-primary",
  "button-primary-fg": "color-primary-foreground",
  "button-primary-bg-hover": "color-primary-hover",
  "button-primary-bg-active": "color-primary-active",
  "button-danger-bg": "color-danger",
  "button-danger-fg": "color-danger-foreground",
  "button-danger-bg-hover": "color-danger-hover",
  "button-danger-bg-active": "color-danger-active",
  "button-radius": "radius-control",
  "button-height-sm": "control-height-sm",
  "button-height-md": "control-height-md",
  "button-height-lg": "control-height-lg",

  "input-bg": "color-surface",
  "input-border": "color-border-strong",
  "input-focus-ring": "color-focus-ring",
  "input-radius": "radius-control",
  "input-height-sm": "control-height-sm",
  "input-height-md": "control-height-md",
  "input-height-lg": "control-height-lg",

  "card-bg": "color-surface",
  "card-radius": "radius-card",
  "card-shadow": "shadow-card",

  "dialog-bg": "color-surface-raised",
  "dialog-radius": "radius-modal",
  "dialog-shadow": "shadow-dialog",
  "dialog-overlay": "color-overlay",

  "menu-bg": "color-surface-raised",
  "menu-radius": "radius-control",
  "menu-shadow": "shadow-dropdown",

  "tooltip-bg": "color-foreground",
  "tooltip-fg": "color-foreground-inverse",
  "tooltip-radius": "radius-tight",

  "panel-bg": "color-surface",
  "panel-radius": "radius-panel",
} as const satisfies Record<string, ColorSemanticName | StaticSemanticName>

export type ComponentTokenName = keyof typeof componentTokens
