// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { applyTheme, setThemePreference, watchSystemPreferences } from "../src/theme/apply"
import {
  CONTRAST_STORAGE_KEY,
  THEME_STORAGE_KEY,
  resolveContrast,
  resolveMode,
} from "../src/theme/preferences"

/**
 * Replaces a property on the window the document actually runs scripts
 * against. `vi.stubGlobal` writes to the test realm's globalThis, which an
 * inline `<script>` never reads — a stub placed there leaves the test
 * agreeing with whatever jsdom does by default.
 */
const restorers: Array<() => void> = []

function patchWindow(name: string, value: unknown): void {
  const target = document.defaultView as unknown as Record<string, unknown>
  const original = Object.getOwnPropertyDescriptor(target, name)

  Object.defineProperty(target, name, { value, configurable: true, writable: true })

  restorers.push(() => {
    if (original) Object.defineProperty(target, name, original)
    else delete target[name]
  })
}

/** Stands in for the media queries the browser answers. */
function stubMatchMedia(matches: Record<string, boolean>): Array<() => void> {
  const listeners: Array<() => void> = []

  patchWindow("matchMedia", (query: string) => ({
    matches: matches[query] ?? false,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    },
  }))

  return listeners
}

afterEach(() => {
  while (restorers.length > 0) restorers.pop()?.()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-contrast")
})

describe("resolving a preference", () => {
  it("honours an explicit choice over the system", () => {
    expect(resolveMode("light", true)).toBe("light")
    expect(resolveMode("dark", false)).toBe("dark")
    expect(resolveContrast("normal", true)).toBe("normal")
  })

  it("follows the system when the choice is system", () => {
    expect(resolveMode("system", true)).toBe("dark")
    expect(resolveMode("system", false)).toBe("light")
    expect(resolveContrast("system", true)).toBe("high")
  })

  it("lands somewhere legible when the stored value is nonsense", () => {
    expect(resolveMode("solarized", false)).toBe("light")
    expect(resolveMode(undefined, false)).toBe("light")
    expect(resolveContrast(null, false)).toBe("normal")
  })
})

describe("applying a preference after first paint", () => {
  it("resolves system against the current media state", () => {
    stubMatchMedia({ "(prefers-color-scheme: dark)": true })

    applyTheme("system", "system")

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("stores the choice so the next first paint agrees with this one", () => {
    stubMatchMedia({})

    setThemePreference("dark", "high")

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    expect(localStorage.getItem(CONTRAST_STORAGE_KEY)).toBe("high")
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("changes the interface even when the choice cannot be remembered", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Quota exceeded.")
      },
    })
    stubMatchMedia({})

    expect(() => setThemePreference("dark", "normal")).not.toThrow()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("follows the system while the preference stays system", () => {
    const listeners = stubMatchMedia({ "(prefers-color-scheme: dark)": false })
    const unsubscribe = watchSystemPreferences(() => ({ theme: "system", contrast: "system" }))

    expect(listeners.length).toBe(2)

    stubMatchMedia({ "(prefers-color-scheme: dark)": true })
    for (const listener of listeners) listener()

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")

    unsubscribe()
  })

  it("stops following once unsubscribed", () => {
    const listeners = stubMatchMedia({})
    const unsubscribe = watchSystemPreferences(() => ({ theme: "system", contrast: "system" }))

    unsubscribe()

    expect(listeners.length).toBe(0)
  })
})
