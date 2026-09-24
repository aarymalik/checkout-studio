import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"
import { themeScript } from "../src/theme/script"

/**
 * The pre-paint script is tested by running it, in a document built for the
 * purpose.
 *
 * It runs as an inline `<script>` in the browser's own realm, which the test
 * realm cannot reach: a stub placed on the test's globals is invisible to it,
 * and a test written that way passes by agreeing with jsdom's defaults rather
 * than by exercising anything. Building the document here makes the inputs
 * — stored preference, media queries — explicit and actually injectable.
 */
function render(options: {
  stored?: Record<string, string>
  media?: Record<string, boolean>
  storageThrows?: boolean
}): { theme: string | null; contrast: string | null } {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    runScripts: "outside-only",
  })

  const { window } = dom

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: options.media?.[query] ?? false }),
  })

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: options.storageThrows
      ? {
          getItem: () => {
            throw new Error("The operation is insecure.")
          },
        }
      : { getItem: (key: string) => options.stored?.[key] ?? null },
  })

  window.eval(themeScript)

  const root = window.document.documentElement
  return { theme: root.getAttribute("data-theme"), contrast: root.getAttribute("data-contrast") }
}

describe("the pre-paint script", () => {
  it("writes the stored preference onto the document", () => {
    expect(render({ stored: { "cs-theme": "dark", "cs-contrast": "high" } })).toEqual({
      theme: "dark",
      contrast: "high",
    })
  })

  it("follows the system when nothing is stored", () => {
    expect(
      render({ media: { "(prefers-color-scheme: dark)": true, "(prefers-contrast: more)": true } }),
    ).toEqual({ theme: "dark", contrast: "high" })
  })

  it("prefers an explicit choice over the system", () => {
    expect(
      render({ stored: { "cs-theme": "light" }, media: { "(prefers-color-scheme: dark)": true } }),
    ).toEqual({ theme: "light", contrast: "normal" })
  })

  it("ignores a stored value it does not understand", () => {
    expect(render({ stored: { "cs-theme": "solarized" } }).theme).toBe("light")
  })

  it("always writes an explicit mode, because the high-contrast rules select on one", () => {
    // [data-theme="light"][data-contrast="high"] cannot match a document that
    // left the attribute off and relied on :root for its light palette.
    expect(render({})).toEqual({ theme: "light", contrast: "normal" })
  })

  it("still paints when storage throws, as it does in a locked-down browser", () => {
    expect(render({ storageThrows: true })).toEqual({ theme: "light", contrast: "normal" })
  })

  it("is a single self-contained expression, so it can be inlined as-is", () => {
    expect(themeScript.startsWith("(function(){")).toBe(true)
    expect(themeScript.trimEnd().endsWith("})();")).toBe(true)
    expect(themeScript).not.toContain("</script")
  })
})
