import type { ColorTheme } from "../tokens/semantics"

/**
 * Dark mode.
 *
 * Elevation inverts: a raised surface is lighter than the one behind it, which
 * is why shadows do less work here and surface steps do more. Accents lighten
 * too — blue-600 on a near-black panel measures 3.3:1, below AA for text — so
 * the primary carries a near-black label instead of a white one.
 */
export const dark: ColorTheme = {
  "color-background": "gray-950",
  "color-canvas": "gray-950",
  "color-surface": "gray-900",
  "color-surface-raised": "gray-850",
  "color-surface-sunken": "gray-950",
  "color-surface-hover": "gray-800",
  "color-surface-active": "gray-700",

  "color-border": "gray-800",
  "color-border-strong": "gray-500",

  "color-foreground": "gray-50",
  "color-foreground-muted": "gray-400",
  "color-foreground-subtle": "gray-500",
  "color-foreground-inverse": "gray-950",

  "color-primary": "blue-400",
  "color-primary-hover": "blue-300",
  "color-primary-active": "blue-200",
  "color-primary-foreground": "gray-950",
  "color-primary-subtle": "blue-950",

  "color-success": "green-400",
  "color-success-foreground": "gray-950",
  "color-success-subtle": "green-950",

  "color-warning": "amber-400",
  "color-warning-foreground": "gray-950",
  "color-warning-subtle": "amber-950",

  "color-danger": "red-400",
  "color-danger-hover": "red-300",
  "color-danger-active": "red-200",
  "color-danger-foreground": "gray-950",
  "color-danger-subtle": "red-950",

  "color-focus-ring": "blue-400",
  "color-selection": { alphaOf: "blue-400", alpha: "alpha-selection" },
  "color-overlay": { alphaOf: "gray-950", alpha: "alpha-overlay" },
}
