import { describe, expect, it } from "vitest"
import { cn } from "./cn"

/**
 * Every component in the library accepts a `className`, and the promise is that
 * it wins. A merge that quietly keeps both classes leaves the caller's
 * override depending on CSS source order — which is to say, on luck.
 */
describe("cn", () => {
  it("lets a later class replace an earlier one of the same kind", () => {
    expect(cn("bg-primary", "bg-danger")).toBe("bg-danger")
    expect(cn("text-foreground", "text-danger")).toBe("text-danger")
  })

  it("understands our radius scale, which Tailwind knows nothing about", () => {
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card")
    expect(cn("rounded-tight", "rounded-pill")).toBe("rounded-pill")
  })

  it("understands our type scale", () => {
    expect(cn("text-body", "text-small")).toBe("text-small")
    expect(cn("text-h1", "text-caption")).toBe("text-caption")
  })

  it("understands our elevation and type-family scales", () => {
    expect(cn("shadow-card", "shadow-dialog")).toBe("shadow-dialog")
    expect(cn("font-body", "font-code")).toBe("font-code")
  })

  it("understands control heights and motion durations", () => {
    expect(cn("h-control-sm", "h-control-lg")).toBe("h-control-lg")
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow")
  })

  it("tells a font size from a text colour", () => {
    // `text-small` is a size and `text-foreground` is a colour: overriding one
    // must not drop the other.
    expect(cn("text-small text-foreground", "text-danger")).toBe("text-small text-danger")
  })

  it("keeps classes that do not conflict", () => {
    expect(cn("inline-flex items-center", "gap-2")).toBe("inline-flex items-center gap-2")
  })

  it("flattens the conditionals a component builds its class list from", () => {
    expect(cn("base", false, null, undefined, ["a", "b"], { c: true, d: false })).toBe("base a b c")
  })

  it("distinguishes a state variant from the base it modifies", () => {
    // hover:bg-* and bg-* are different declarations; dropping the base
    // because a hover style exists would leave the button transparent.
    expect(cn("bg-primary hover:bg-primary-hover", "bg-danger")).toBe(
      "hover:bg-primary-hover bg-danger",
    )
  })
})
