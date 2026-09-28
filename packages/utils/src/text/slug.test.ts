import { describe, expect, it } from "vitest"

import { slugify, uniqueSlug } from "./slug"

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("My Checkout Page")).toBe("my-checkout-page")
  })

  // "Café" should become "cafe", not "caf".
  it("folds accents rather than dropping the letters", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme")
    expect(slugify("Ünïcôde")).toBe("unicode")
  })

  it("collapses runs of punctuation into one hyphen", () => {
    expect(slugify("Spring —— Sale!!! 2026")).toBe("spring-sale-2026")
  })

  it("trims hyphens from both ends", () => {
    expect(slugify("  ...Hello...  ")).toBe("hello")
  })

  it("keeps digits", () => {
    expect(slugify("Plan 9")).toBe("plan-9")
  })

  it("returns nothing when nothing survives", () => {
    expect(slugify("！！！")).toBe("")
    expect(slugify("")).toBe("")
  })

  it("truncates a long name without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(59)} b`)

    expect(slug).toHaveLength(59)
    expect(slug.endsWith("-")).toBe(false)
  })
})

describe("uniqueSlug", () => {
  it("uses the plain slug when it is free", () => {
    expect(uniqueSlug("Checkout", [])).toBe("checkout")
  })

  it("counts up past what is taken", () => {
    expect(uniqueSlug("Checkout", ["checkout"])).toBe("checkout-2")
    expect(uniqueSlug("Checkout", ["checkout", "checkout-2"])).toBe("checkout-3")
  })

  it("skips a gap rather than reusing it", () => {
    expect(uniqueSlug("Checkout", ["checkout", "checkout-3"])).toBe("checkout-2")
  })

  it("falls back when the name slugifies to nothing", () => {
    expect(uniqueSlug("！！！", [])).toBe("project")
    expect(uniqueSlug("！！！", ["project"])).toBe("project-2")
  })

  it("takes the fallback it is given", () => {
    expect(uniqueSlug("", [], "page")).toBe("page")
  })
})
