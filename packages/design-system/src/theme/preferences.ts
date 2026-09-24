/**
 * How a reader's theme preference is stored and resolved.
 *
 * Mode is stored per user rather than per project, and persists across
 * sessions and devices (docs/theme-system.md § Modes). The copy in local
 * storage is what the pre-paint script can reach before any network call, so
 * it is the one that decides the first frame.
 */

export const THEME_STORAGE_KEY = "cs-theme"
export const CONTRAST_STORAGE_KEY = "cs-contrast"

/** What the reader chose. `system` defers to the operating system. */
export type ThemePreference = "light" | "dark" | "system"
export type ContrastPreference = "normal" | "high" | "system"

/** What actually gets written to the document. */
export type ResolvedMode = "light" | "dark"
export type ResolvedContrast = "normal" | "high"

export const THEME_ATTRIBUTE = "data-theme"
export const CONTRAST_ATTRIBUTE = "data-contrast"

/**
 * Resolves a preference against the system.
 *
 * Light is the fallback rather than the default: an unreadable preference
 * should land somewhere legible, and the light palette is what `:root` paints
 * when no attribute is present at all.
 */
export function resolveMode(preference: unknown, prefersDark: boolean): ResolvedMode {
  if (preference === "light" || preference === "dark") return preference
  return prefersDark ? "dark" : "light"
}

export function resolveContrast(preference: unknown, prefersMore: boolean): ResolvedContrast {
  if (preference === "normal" || preference === "high") return preference
  return prefersMore ? "high" : "normal"
}

/** Whether a stored value is a preference this version understands. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function isContrastPreference(value: unknown): value is ContrastPreference {
  return value === "normal" || value === "high" || value === "system"
}
