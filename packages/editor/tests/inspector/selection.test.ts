import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { describe, expect, it } from "vitest"

import { commonProperties, mixedKeys } from "../../src/inspector"

/**
 * Editing several components at once.
 *
 * Both halves of it are a question about disagreement: which properties they
 * all have, and which values they do not all share.
 */

function props(...inputs: Parameters<typeof defineProperties>[0]): readonly PropertyDefinition[] {
  return defineProperties(inputs) as readonly PropertyDefinition[]
}

type Input = Parameters<typeof defineProperties>[0][number]

// Annotated rather than `as const`: the SDK takes a mutable options array, and
// a readonly tuple is not assignable to one.
const SIZE: Input = {
  key: "fontSize",
  target: "prop",
  label: "Size",
  group: "Typography",
  control: "number",
}

const LEVEL: Input = {
  key: "level",
  target: "prop",
  label: "Level",
  group: "General",
  control: "select",
  options: [
    { value: 1, label: "One" },
    { value: 2, label: "Two" },
  ],
}

describe("the properties a selection has in common", () => {
  it("is all of them when only one thing is selected", () => {
    const only = props(SIZE, LEVEL)

    expect(commonProperties([only])).toBe(only)
  })

  it("is nothing when nothing is selected", () => {
    expect(commonProperties([])).toEqual([])
  })

  it("keeps what both registered and drops what only one did", () => {
    /*
     * A Heading and a Button both have a size and the panel can set both at
     * once. Only the Heading has a level, and a control that wrote one to a
     * Button would be writing a prop the component does not read.
     */
    const common = commonProperties([props(SIZE, LEVEL), props(SIZE)])

    expect(common.map((one) => one.key)).toEqual(["fontSize"])
  })

  it("does not treat two different controls as the same property", () => {
    /*
     * Two components may both call something `size` and mean a number in one
     * and a length in the other. One editor over two shapes would write
     * whichever it happened to draw into both.
     */
    const asLength: Input = {
      ...SIZE,
      target: "style",
      control: "dimension",
      units: ["px"],
    }

    expect(commonProperties([props(SIZE), props(asLength)])).toEqual([])
  })

  it("keeps the first selection's order", () => {
    const common = commonProperties([props(LEVEL, SIZE), props(SIZE, LEVEL)])

    expect(common.map((one) => one.key)).toEqual(["level", "fontSize"])
  })
})

describe("the values a selection disagrees on", () => {
  it("finds nothing to disagree about in one node", () => {
    expect(mixedKeys([{ a: 1, b: 2 }])).toEqual(new Set())
  })

  it("names a key they hold differently", () => {
    expect(
      mixedKeys([
        { a: 1, b: 2 },
        { a: 1, b: 3 },
      ]),
    ).toEqual(new Set(["b"]))
  })

  it("counts a key one of them does not hold at all", () => {
    /*
     * `undefined` is compared rather than skipped. A heading with no colour
     * and one with a colour do not agree about colour, and a panel that
     * treated the missing one as "no opinion" would show the other's.
     */
    expect(mixedKeys([{ a: 1 }, {}])).toEqual(new Set(["a"]))
  })

  it("agrees about a side bag when the assembled shorthands match", () => {
    // What `valuesFor` hands over for a padding is a string, so two nodes with
    // the same four sides agree even when the shapes behind them differ.
    expect(mixedKeys([{ padding: "16px 8px" }, { padding: "16px 8px" }])).toEqual(new Set())
  })
})
