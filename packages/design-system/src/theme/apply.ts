import {
  CONTRAST_ATTRIBUTE,
  CONTRAST_STORAGE_KEY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  resolveContrast,
  resolveMode,
} from "./preferences"
import type { ContrastPreference, ThemePreference } from "./preferences"

/**
 * Applying a preference after first paint.
 *
 * The pre-paint script handles the first frame; this handles every change
 * after it — the reader switching mode, or the operating system switching
 * underneath a reader who chose `system`.
 */

function prefers(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(query).matches
    : false
}

/**
 * The document element, or null where there is no document.
 *
 * Deliberately a function rather than a default parameter value: a default of
 * `document.documentElement` is evaluated at the call, before any guard in the
 * body can run, so it throws on the server instead of being skipped there.
 */
function documentRoot(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement
}

/**
 * Writes the resolved attributes onto the document.
 *
 * A no-op where there is no document. On the server there is nothing to apply:
 * the pre-paint script writes the attributes on the client before the first
 * frame, which is the only moment that matters.
 */
export function applyTheme(
  theme: ThemePreference,
  contrast: ContrastPreference,
  root: HTMLElement | null = documentRoot(),
): void {
  if (!root) return

  root.setAttribute(THEME_ATTRIBUTE, resolveMode(theme, prefers("(prefers-color-scheme: dark)")))
  root.setAttribute(
    CONTRAST_ATTRIBUTE,
    resolveContrast(contrast, prefers("(prefers-contrast: more)")),
  )
}

/**
 * Persists a preference and applies it.
 *
 * Storage can throw; the interface still changes when it does. A reader whose
 * browser refuses to remember the choice should still see the choice take
 * effect.
 */
export function setThemePreference(
  theme: ThemePreference,
  contrast: ContrastPreference,
  root: HTMLElement | null = documentRoot(),
): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    localStorage.setItem(CONTRAST_STORAGE_KEY, contrast)
  } catch {
    // A preference that cannot be remembered is still a preference.
  }

  applyTheme(theme, contrast, root)
}

/**
 * Keeps a `system` preference honest.
 *
 * Returns an unsubscribe function. Without this, a reader who chose `system`
 * and then switched their operating system to dark keeps the light interface
 * until they reload.
 */
export function watchSystemPreferences(
  getPreferences: () => { theme: ThemePreference; contrast: ContrastPreference },
  root: HTMLElement | null = documentRoot(),
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}

  const queries = [
    window.matchMedia("(prefers-color-scheme: dark)"),
    window.matchMedia("(prefers-contrast: more)"),
  ]

  const onChange = () => {
    const { theme, contrast } = getPreferences()
    applyTheme(theme, contrast, root)
  }

  for (const query of queries) query.addEventListener("change", onChange)

  return () => {
    for (const query of queries) query.removeEventListener("change", onChange)
  }
}
