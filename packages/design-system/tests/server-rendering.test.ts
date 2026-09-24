import { describe, expect, it } from "vitest"
import { applyTheme, watchSystemPreferences } from "../src/theme/apply"

/**
 * These helpers are imported by the Studio layout, which renders on the server
 * first. There is no `window` there to ask about media preferences, and a
 * module that assumes one turns a theme preference into a 500.
 *
 * This file deliberately runs in the node environment: the absence of a window
 * is the condition under test.
 */
function fakeRoot(): { attributes: Record<string, string> } & Pick<HTMLElement, "setAttribute"> {
  const attributes: Record<string, string> = {}
  return {
    attributes,
    setAttribute(name: string, value: string) {
      attributes[name] = value
    },
  } as never
}

describe("where there is no window", () => {
  it("resolves a system preference to the palette :root already paints", () => {
    const root = fakeRoot()

    applyTheme("system", "system", root as unknown as HTMLElement)

    expect(root.attributes["data-theme"]).toBe("light")
    expect(root.attributes["data-contrast"]).toBe("normal")
  })

  it("still honours an explicit preference", () => {
    const root = fakeRoot()

    applyTheme("dark", "high", root as unknown as HTMLElement)

    expect(root.attributes["data-theme"]).toBe("dark")
    expect(root.attributes["data-contrast"]).toBe("high")
  })

  it("returns a no-op unsubscribe rather than subscribing to nothing", () => {
    // Called the way a component calls it: with no root, because on the client
    // there is a document to find. A default parameter reaching for
    // `document.documentElement` would throw here before any guard could run.
    const stop = watchSystemPreferences(() => ({ theme: "system", contrast: "system" }))

    expect(typeof stop).toBe("function")
    expect(() => stop()).not.toThrow()
  })

  it("applies nothing rather than throwing when there is no document at all", () => {
    expect(() => applyTheme("dark", "high")).not.toThrow()
  })
})
