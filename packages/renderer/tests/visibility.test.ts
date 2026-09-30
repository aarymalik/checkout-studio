import type { Node, VisibilityCondition } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { evaluateCondition, evaluateVisibility } from "../src/visibility/evaluate"
import { documentOf } from "./support"

function nodeWith(visibility: Partial<Node["visibility"]>): Node {
  return documentOf("n", [{ id: "n", visibility }]).nodes["n"] as Node
}

function condition(
  source: string,
  operator: VisibilityCondition["operator"],
  value?: VisibilityCondition["value"],
): VisibilityCondition {
  return value === undefined ? { source, operator } : { source, operator, value }
}

describe("one condition", () => {
  it("compares for equality", () => {
    expect(evaluateCondition(condition("country", "equals", "US"), { country: "US" })).toBe(true)
    expect(evaluateCondition(condition("country", "equals", "US"), { country: "DE" })).toBe(false)
    expect(evaluateCondition(condition("country", "not-equals", "US"), { country: "DE" })).toBe(
      true,
    )
  })

  it("treats a condition with no value as comparing against null", () => {
    expect(evaluateCondition(condition("coupon", "equals"), { coupon: null })).toBe(true)
    expect(evaluateCondition(condition("coupon", "not-equals"), { coupon: "SAVE10" })).toBe(true)
  })

  it("compares numbers", () => {
    expect(evaluateCondition(condition("total", "greater-than", 50), { total: 80 })).toBe(true)
    expect(evaluateCondition(condition("total", "greater-than", 50), { total: 20 })).toBe(false)
    expect(evaluateCondition(condition("total", "less-than", 50), { total: 20 })).toBe(true)
    expect(evaluateCondition(condition("total", "less-than", 50), { total: 80 })).toBe(false)
  })

  it("refuses to compare a string with a number", () => {
    // `"10" > 9` is true and `"10" > "9"` is false. Neither is what anybody
    // meant, so the answer is "undecidable" rather than a coin toss.
    expect(evaluateCondition(condition("total", "greater-than", 50), { total: "80" })).toBeNull()
    expect(evaluateCondition(condition("total", "less-than", "50"), { total: 80 })).toBeNull()
  })

  it("asks whether a source holds anything", () => {
    expect(evaluateCondition(condition("coupon", "exists"), { coupon: "SAVE10" })).toBe(true)
    expect(evaluateCondition(condition("coupon", "exists"), { coupon: null })).toBe(false)
    // Absent is undecidable even here: the server has not been told about the
    // coupon field, which is not the same as being told it is empty.
    expect(evaluateCondition(condition("coupon", "exists"), {})).toBeNull()
  })

  it("asks whether a source is empty", () => {
    expect(evaluateCondition(condition("note", "empty"), { note: "" })).toBe(true)
    expect(evaluateCondition(condition("note", "empty"), { note: "   " })).toBe(true)
    expect(evaluateCondition(condition("note", "empty"), { note: "hello" })).toBe(false)
    expect(evaluateCondition(condition("items", "empty"), { items: [] })).toBe(true)
    expect(evaluateCondition(condition("items", "empty"), { items: [1] })).toBe(false)
    expect(evaluateCondition(condition("total", "empty"), { total: 0 })).toBe(false)
    expect(evaluateCondition(condition("total", "empty"), { total: null })).toBe(true)
  })

  it("cannot answer for a source nobody has supplied", () => {
    // Absent is undecidable, not false. "Hide unless the coupon is applied"
    // must not hide the node just because nobody has mentioned coupons yet.
    expect(evaluateCondition(condition("coupon", "equals", "SAVE10"), {})).toBeNull()
    expect(evaluateCondition(condition("note", "empty"), {})).toBeNull()
  })
})

describe("a node's visibility", () => {
  it("is visible by default, at every breakpoint", () => {
    expect(evaluateVisibility(nodeWith({}), {})).toEqual({
      decision: "visible",
      breakpoints: ["desktop", "tablet", "mobile"],
    })
  })

  it("is hidden absolutely when the editor's switch is off", () => {
    const result = evaluateVisibility(
      nodeWith({ hidden: true, conditions: [condition("total", "greater-than", 0)] }),
      { total: 100 },
    )

    // The editor's own switch beats every condition. Hidden means hidden.
    expect(result.decision).toBe("hidden")
  })

  it("keeps the breakpoints it was narrowed to", () => {
    expect(evaluateVisibility(nodeWith({ breakpoints: ["desktop"] }), {})).toEqual({
      decision: "visible",
      breakpoints: ["desktop"],
    })
  })

  it("is hidden when it is visible at no breakpoint at all", () => {
    expect(evaluateVisibility(nodeWith({ breakpoints: [] }), {}).decision).toBe("hidden")
  })

  it("is hidden when any condition is false", () => {
    const node = nodeWith({
      conditions: [condition("country", "equals", "US"), condition("total", "greater-than", 50)],
    })

    expect(evaluateVisibility(node, { country: "DE", total: 80 }).decision).toBe("hidden")
  })

  it("is visible when every condition holds", () => {
    const node = nodeWith({
      conditions: [condition("country", "equals", "US"), condition("total", "greater-than", 50)],
    })

    expect(evaluateVisibility(node, { country: "US", total: 80 }).decision).toBe("visible")
  })

  it("defers when a condition cannot be decided here", () => {
    const node = nodeWith({ conditions: [condition("shipping-state", "equals", "CA")] })

    // The rule depends on a field the customer has not filled in. The node
    // renders and the plugin owning that source toggles it.
    expect(evaluateVisibility(node, {}).decision).toBe("deferred")
  })

  it("prefers a definite no over an undecidable maybe", () => {
    const node = nodeWith({
      conditions: [condition("country", "equals", "US"), condition("field", "equals", "x")],
    })

    // Nothing that is definitely hidden should reach the browser, whatever else
    // is undecided about it.
    expect(evaluateVisibility(node, { country: "DE" }).decision).toBe("hidden")
  })
})
