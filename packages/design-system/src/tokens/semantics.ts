import type { PrimitiveName } from "./primitives"

/**
 * Tier 2 — semantics.
 *
 * Meaning, not value. This is the only tier a component may read. Switching
 * mode rebinds these to different primitives; nothing else in the system
 * moves, which is why no component contains a conditional for dark mode.
 *
 * See docs/theme-system.md § Token Tiers.
 */

/**
 * How a semantic token resolves.
 *
 * Either a primitive by name, or a primitive at an alpha — focus rings and
 * selection washes are the seed colour at reduced opacity, and expressing that
 * as a binding keeps the rule "every semantic resolves to a defined primitive"
 * literally true rather than almost true.
 */
export type SemanticBinding =
  PrimitiveName | { readonly alphaOf: PrimitiveName; readonly alpha: PrimitiveName }

/**
 * Colour semantics. Every one of these is rebound per mode, so the list is
 * declared once and each theme is typed against it: a theme that forgets a
 * token fails to compile rather than falling back to something plausible.
 */
export const COLOR_SEMANTICS = [
  // Surfaces, from furthest back to nearest front.
  "color-background",
  "color-canvas",
  "color-surface",
  "color-surface-raised",
  "color-surface-sunken",
  "color-surface-hover",
  "color-surface-active",

  // Borders. Used sparingly — docs/design-system.md asks for spacing before lines.
  "color-border",
  "color-border-strong",

  // Text.
  "color-foreground",
  "color-foreground-muted",
  "color-foreground-subtle",
  "color-foreground-inverse",

  // Primary action.
  "color-primary",
  "color-primary-hover",
  "color-primary-active",
  "color-primary-foreground",
  "color-primary-subtle",

  // Status. Each solid colour carries the foreground that is legible on it,
  // and a subtle wash for backgrounds that sit behind ordinary text.
  "color-success",
  "color-success-foreground",
  "color-success-subtle",
  "color-warning",
  "color-warning-foreground",
  "color-warning-subtle",
  "color-danger",
  "color-danger-hover",
  "color-danger-active",
  "color-danger-foreground",
  "color-danger-subtle",

  // Interaction.
  "color-focus-ring",
  "color-selection",
  "color-overlay",
] as const

export type ColorSemanticName = (typeof COLOR_SEMANTICS)[number]

/** A complete colour binding for one mode. */
export type ColorTheme = Readonly<Record<ColorSemanticName, SemanticBinding>>

/**
 * Semantics that carry no colour and therefore do not change with mode.
 *
 * Radius, type, motion and layout mean the same thing in the dark.
 */
export const staticSemantics = {
  // Radius by role, so a component asks for "a control" rather than for 12px.
  "radius-control": "radius-12",
  "radius-card": "radius-16",
  "radius-panel": "radius-18",
  "radius-modal": "radius-20",
  "radius-pill": "radius-full",
  "radius-tight": "radius-8",

  // Motion. The three durations every animation in the product may use.
  "duration-fast": "duration-150",
  "duration-normal": "duration-180",
  "duration-slow": "duration-220",
  "easing-standard": "easing-out",
  "duration-spin": "spin-1500",
  "duration-pulse": "pulse-2000",

  // Elevation by role rather than by number.
  "shadow-card": "shadow-raw-1",
  "shadow-dropdown": "shadow-raw-2",
  "shadow-dialog": "shadow-raw-3",
  "shadow-toast": "shadow-raw-4",

  // Type. The scale from docs/design-system.md, each step bound to a size.
  "font-body": "font-sans",
  "font-display": "font-secondary",
  "font-code": "font-mono",

  "text-display": "text-48",
  "text-hero": "text-36",
  "text-h1": "text-30",
  "text-h2": "text-24",
  "text-h3": "text-20",
  "text-h4": "text-18",
  "text-body-lg": "text-16",
  "text-body": "text-14",
  "text-small": "text-13",
  "text-caption": "text-12",
  "text-tiny": "text-11",

  "leading-tight": "leading-115",
  "leading-heading": "leading-125",
  "leading-body": "leading-160",

  // Control heights, so a size variant names an intent rather than a number.
  "control-height-sm": "size-8",
  "control-height-md": "size-10",
  "control-height-lg": "size-12",

  // Layout.
  "toolbar-height": "layout-toolbar",
  "status-bar-height": "layout-status-bar",
  "panel-width-left": "layout-panel-left",
  "panel-width-right": "layout-panel-right",
} as const satisfies Record<string, PrimitiveName>

export type StaticSemanticName = keyof typeof staticSemantics

export type SemanticName = ColorSemanticName | StaticSemanticName

/**
 * The pairings that must pass WCAG AA.
 *
 * Contrast is a property of a pair, not of a colour, so the pairs the product
 * actually renders are declared here and verified in both modes and at high
 * contrast. A pairing that is not in this list is one nobody has checked.
 *
 * `large` marks text at 18px or above, where AA is 3:1 rather than 4.5:1.
 * Focus rings and control boundaries are non-text contrast, which AA sets at
 * 3:1.
 *
 * `color-border` is deliberately absent. WCAG 1.4.11 governs the boundaries of
 * user interface components, not decoration: a divider between two sections,
 * or the outline of a card that a reader already identifies by its surface,
 * carries no information and is allowed to stay a hairline. Anything a reader
 * must see to operate a control — an input's edge, a checkbox's box — uses
 * `color-border-strong`, which is in this list and is bound a good deal darker
 * than a designer would choose by eye for exactly that reason.
 */
export const CONTRAST_PAIRINGS = [
  { foreground: "color-foreground", background: "color-background" },
  { foreground: "color-foreground", background: "color-surface" },
  { foreground: "color-foreground", background: "color-surface-raised" },
  { foreground: "color-foreground", background: "color-surface-sunken" },
  { foreground: "color-foreground", background: "color-canvas" },
  { foreground: "color-foreground-muted", background: "color-surface" },
  { foreground: "color-foreground-muted", background: "color-background" },
  { foreground: "color-foreground-subtle", background: "color-surface", large: true },
  { foreground: "color-primary", background: "color-surface" },
  { foreground: "color-primary-foreground", background: "color-primary" },
  { foreground: "color-primary-foreground", background: "color-primary-hover" },
  { foreground: "color-primary-foreground", background: "color-primary-active" },
  { foreground: "color-foreground", background: "color-primary-subtle" },
  { foreground: "color-success-foreground", background: "color-success" },
  { foreground: "color-foreground", background: "color-success-subtle" },
  { foreground: "color-warning-foreground", background: "color-warning" },
  { foreground: "color-foreground", background: "color-warning-subtle" },
  { foreground: "color-danger-foreground", background: "color-danger" },
  { foreground: "color-danger-foreground", background: "color-danger-hover" },
  { foreground: "color-danger-foreground", background: "color-danger-active" },
  { foreground: "color-danger", background: "color-surface" },
  { foreground: "color-foreground", background: "color-danger-subtle" },
  { foreground: "color-foreground-inverse", background: "color-foreground" },
  { foreground: "color-border-strong", background: "color-surface", nonText: true },
  { foreground: "color-focus-ring", background: "color-surface", nonText: true },
  { foreground: "color-focus-ring", background: "color-background", nonText: true },
] as const satisfies ReadonlyArray<{
  foreground: ColorSemanticName
  background: ColorSemanticName
  large?: boolean
  nonText?: boolean
}>
