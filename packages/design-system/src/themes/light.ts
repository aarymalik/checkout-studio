import type { ColorTheme } from "../tokens/semantics"

/**
 * Light mode.
 *
 * The chrome sits on a faint grey so that white panels read as raised without
 * a border doing the work — docs/design-system.md asks for spacing and surface
 * before lines.
 */
export const light: ColorTheme = {
  "color-background": "gray-50",
  "color-canvas": "gray-100",
  "color-surface": "gray-0",
  "color-surface-raised": "gray-0",
  "color-surface-sunken": "gray-100",
  "color-surface-hover": "gray-100",
  "color-surface-active": "gray-150",

  "color-border": "gray-200",
  // Strong enough to carry a control's boundary on its own: WCAG 1.4.11 asks
  // for 3:1, which rules out the hairline greys a decorative border can use.
  "color-border-strong": "gray-500",

  "color-foreground": "gray-950",
  "color-foreground-muted": "gray-600",
  "color-foreground-subtle": "gray-500",
  "color-foreground-inverse": "gray-0",

  "color-primary": "blue-600",
  "color-primary-hover": "blue-700",
  "color-primary-active": "blue-800",
  "color-primary-foreground": "gray-0",
  "color-primary-subtle": "blue-50",

  // Green 700 rather than 600: white on green-600 measures 3.3:1, which fails
  // AA for the label a solid status pill carries.
  "color-success": "green-700",
  "color-success-foreground": "gray-0",
  "color-success-subtle": "green-50",

  // Amber takes a near-black label. No amber dark enough for white text is
  // still recognisably amber.
  "color-warning": "amber-600",
  "color-warning-foreground": "gray-950",
  "color-warning-subtle": "amber-50",

  "color-danger": "red-600",
  "color-danger-hover": "red-700",
  "color-danger-active": "red-800",
  "color-danger-foreground": "gray-0",
  "color-danger-subtle": "red-50",

  // Solid, not a wash: a 40% tint of the seed measures under 3:1 against white
  // and a focus ring nobody can see is not a focus ring.
  "color-focus-ring": "blue-600",
  "color-selection": { alphaOf: "blue-600", alpha: "alpha-selection" },
  "color-overlay": { alphaOf: "gray-950", alpha: "alpha-overlay" },
}
