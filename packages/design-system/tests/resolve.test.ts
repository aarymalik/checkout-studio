import { describe, expect, it } from "vitest"
import { bindingsFor, resolveColor } from "../src/tokens/resolve"
import { primitives } from "../src/tokens/primitives"

describe("resolving a token to its value", () => {
  it("returns the primitive the mode binds it to", () => {
    expect(resolveColor("color-surface", "light")).toBe(primitives["gray-0"])
    expect(resolveColor("color-surface", "dark")).toBe(primitives["gray-900"])
  })

  it("returns null for a translucent token, which has no single colour", () => {
    // What a 15% wash looks like depends on what is behind it, so there is
    // nothing to measure contrast against.
    expect(resolveColor("color-selection", "light")).toBeNull()
    expect(resolveColor("color-overlay", "dark")).toBeNull()
  })

  it("applies the high-contrast override over the active mode", () => {
    expect(resolveColor("color-border", "light", "normal")).toBe(primitives["gray-200"])
    expect(resolveColor("color-border", "light", "high")).toBe(primitives["gray-950"])
    expect(resolveColor("color-border", "dark", "high")).toBe(primitives["gray-50"])
  })

  it("leaves tokens high contrast does not mention alone", () => {
    expect(resolveColor("color-primary", "dark", "high")).toBe(
      resolveColor("color-primary", "dark", "normal"),
    )
  })

  it("refuses a token it has no binding for, rather than resolving to nothing", () => {
    // A typo in a token name should stop a test, not paint a transparent
    // element that someone notices in production.
    expect(() =>
      // @ts-expect-error -- the point is the runtime behaviour when types are bypassed
      resolveColor("color-srface", "light"),
    ).toThrow(/No binding for color-srface/)
  })

  it("hands back a copy, so a caller cannot mutate the theme", () => {
    const bindings = bindingsFor("light")
    bindings["color-surface"] = "red-600"

    expect(resolveColor("color-surface", "light")).toBe(primitives["gray-0"])
  })
})
