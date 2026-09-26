import { describe, expect, it } from "vitest"
import { isContrastPreference, isThemePreference } from "../src/theme/preferences"

/**
 * The guards exist because a stored preference is untrusted input: it was
 * written by an older version of the product, or by a reader editing local
 * storage, and it arrives as a string.
 */
describe("recognising a stored preference", () => {
  it("accepts the three theme preferences", () => {
    expect(isThemePreference("light")).toBe(true)
    expect(isThemePreference("dark")).toBe(true)
    expect(isThemePreference("system")).toBe(true)
  })

  it("rejects anything else, including values a future version might add", () => {
    expect(isThemePreference("sepia")).toBe(false)
    expect(isThemePreference("")).toBe(false)
    expect(isThemePreference(null)).toBe(false)
    expect(isThemePreference(undefined)).toBe(false)
    expect(isThemePreference(0)).toBe(false)
  })

  it("accepts the three contrast preferences and nothing else", () => {
    expect(isContrastPreference("normal")).toBe(true)
    expect(isContrastPreference("high")).toBe(true)
    expect(isContrastPreference("system")).toBe(true)
    expect(isContrastPreference("higher")).toBe(false)
    expect(isContrastPreference(true)).toBe(false)
  })
})
