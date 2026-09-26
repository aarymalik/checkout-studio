import type { ColorTheme } from "../tokens/semantics"

/**
 * High contrast.
 *
 * A sparse override over whichever mode is active, not a third palette. It is
 * declared per mode rather than as an alias of `--color-foreground` because
 * high contrast has to do more than darken borders: muted and subtle text stop
 * being muted, which an alias cannot express without reaching past the
 * semantic tier.
 *
 * Only the tokens that carry contrast are listed. Everything else keeps the
 * value the active mode gave it.
 */
export const highContrast: Readonly<{
  light: Partial<ColorTheme>
  dark: Partial<ColorTheme>
}> = {
  light: {
    "color-border": "gray-950",
    "color-border-strong": "gray-950",
    "color-foreground-muted": "gray-800",
    "color-foreground-subtle": "gray-700",
    "color-surface-hover": "gray-150",
    "color-focus-ring": "gray-950",
  },
  dark: {
    "color-border": "gray-50",
    "color-border-strong": "gray-50",
    "color-foreground-muted": "gray-200",
    "color-foreground-subtle": "gray-300",
    "color-surface-hover": "gray-700",
    "color-focus-ring": "gray-50",
  },
}
