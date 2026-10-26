import { describe, expect, it } from "vitest"

import { defineSlotFields } from "../src/properties"
import type { SlotFieldInput } from "../src/properties"

/**
 * A theme slot's field declarations.
 *
 * Validated for the same reason the inspector's properties are: a plugin is
 * third-party code compiled separately, and a declaration that cannot be drawn
 * becomes a panel that renders wrong at the moment somebody is trying to use
 * it. This is the last place that can say so first.
 */

function field(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { key: "maxWidth", label: "Maximum width", control: "dimension", ...overrides }
}

/** Parses untyped input, which is the only way to test a validator. */
function parse(...fields: Record<string, unknown>[]) {
  return defineSlotFields(fields as unknown as SlotFieldInput[])
}

describe("what it accepts", () => {
  it("takes a minimal declaration", () => {
    const [parsed] = parse(field())

    expect(parsed).toEqual({ key: "maxWidth", label: "Maximum width", control: "dimension" })
  })

  it("takes units on a length", () => {
    const [parsed] = parse(field({ units: ["px", "rem", "%"] }))

    expect(parsed?.units).toEqual(["px", "rem", "%"])
  })

  it("takes options on a select", () => {
    const [parsed] = parse(
      field({ control: "select", options: [{ value: "wide", label: "Wide" }] }),
    )

    expect(parsed?.options).toHaveLength(1)
  })

  it("takes several fields", () => {
    expect(parse(field(), field({ key: "gutter", label: "Gutter" }))).toHaveLength(2)
  })
})

describe("what it refuses", () => {
  it("refuses the three a slot has no use for", () => {
    /*
     * A slot value is one value for every instance of a type. There is no node
     * to target, no breakpoint to override it at and no state to hold it in,
     * so a plugin declaring any of them has misunderstood what a slot is —
     * and a silently ignored field is how that misunderstanding survives.
     */
    expect(() => parse(field({ target: "style" }))).toThrow()
    expect(() => parse(field({ responsive: true }))).toThrow()
    expect(() => parse(field({ states: true }))).toThrow()
  })

  it("refuses a group, because the component is the group", () => {
    expect(() => parse(field({ group: "Layout" }))).toThrow()
  })

  it("refuses a select with no options", () => {
    expect(() => parse(field({ control: "select" }))).toThrow(/needs options/)
  })

  it("refuses options on anything but a select", () => {
    expect(() => parse(field({ options: [{ value: 1, label: "One" }] }))).toThrow(/Only a select/)
  })

  it("refuses units on a control that is not a length", () => {
    expect(() => parse(field({ control: "color", units: ["px"] }))).toThrow(/Only a length/)
  })

  it("refuses a minimum above its maximum", () => {
    expect(() => parse(field({ min: 10, max: 2 }))).toThrow(/cannot exceed/)
  })

  it("refuses an unknown control, because a typo renders nothing", () => {
    expect(() => parse(field({ control: "slider" }))).toThrow()
  })

  it("refuses the same key twice, because the second would win silently", () => {
    expect(() => parse(field(), field({ label: "Measure" }))).toThrow(/defined twice/)
  })
})
