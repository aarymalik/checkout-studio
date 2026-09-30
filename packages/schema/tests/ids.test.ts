import { describe, expect, it } from "vitest"

import { createId, prefixFor } from "../src/document/ids"

/**
 * Node identifiers.
 *
 * The one property that matters: within a document, an id is never reused. A
 * collision does not throw — it silently replaces a node with another one.
 */

describe("prefixFor", () => {
  it("takes the readable half of a type id", () => {
    expect(prefixFor("core.heading")).toBe("heading")
    expect(prefixFor("checkout.order-summary")).toBe("order-summary")
  })

  it("accepts a type with no namespace", () => {
    expect(prefixFor("heading")).toBe("heading")
  })

  // This runs while building the document that validation will later check, so
  // it cannot assume the type is well formed.
  it("strips anything that does not belong in an id", () => {
    expect(prefixFor("core.My Heading!")).toBe("myheading")
  })

  it("falls back when nothing survives", () => {
    expect(prefixFor("!!!")).toBe("node")
    expect(prefixFor("")).toBe("node")
  })
})

describe("createId", () => {
  it("reads as the type it belongs to", () => {
    expect(createId("core.heading", new Set())).toMatch(/^heading_[a-z2-9]{4}$/)
  })

  /** The property the whole thing exists for, at the scale the spec names. */
  it("does not repeat itself over ten thousand ids", () => {
    const taken = new Set<string>()

    for (let index = 0; index < 10_000; index += 1) {
      const id = createId("core.text", taken)

      expect(taken.has(id)).toBe(false)
      taken.add(id)
    }

    expect(taken.size).toBe(10_000)
  })

  it("avoids an id that is already taken", () => {
    const only = () => 0
    const taken = new Set(["text_2222"])

    // With a constant random source every candidate is the same, so the only
    // way out is the lengthening fallback.
    expect(createId("core.text", taken, only)).not.toBe("text_2222")
  })

  /*
   * A random source that always returns the same value cannot produce a second
   * id by chance. The fallback lengthens until it is free, which is the only
   * thing that keeps this terminating.
   */
  it("terminates even when the random source is not random", () => {
    const constant = () => 0.5
    const taken = new Set<string>()

    for (let index = 0; index < 20; index += 1) {
      const id = createId("core.text", taken, constant)

      expect(taken.has(id)).toBe(false)
      taken.add(id)
    }

    expect(taken.size).toBe(20)
  })

  it("never runs off the end of the alphabet", () => {
    // Math.random() is documented as < 1, but a stub need not be.
    expect(createId("core.text", new Set(), () => 1)).toMatch(/^text_[a-z2-9]{4}$/)
  })
})
