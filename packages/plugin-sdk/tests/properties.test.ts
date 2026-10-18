import { describe, expect, it } from "vitest"

import {
  PROPERTY_GROUPS,
  defineProperties,
  propertyCondition,
  propertyDefinition,
} from "../src/properties"
import type { PropertyDefinitionInput } from "../src/properties"

/**
 * The property definition schema.
 *
 * Validated rather than merely typed, because a plugin is third-party code
 * compiled separately and because the inspector is generated: a definition that
 * cannot be drawn becomes a panel that renders wrong at the moment somebody is
 * trying to use it, and this is the last place that can say so first.
 *
 * It earned that on its first use. Section's radius offers `px` and `rem`, and
 * the first version of the units rule accepted them only on a dimension or a
 * spacing control — so the schema refused a property that was correct, and it
 * was the rule that was wrong rather than the component.
 */

function property(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "width",
    target: "style",
    label: "Width",
    group: "Layout",
    control: "dimension",
    ...overrides,
  }
}

/**
 * Parses untyped input, which is the only way to test a validator.
 *
 * Half of these cases are definitions the types already refuse — a misspelt
 * group, a field nobody declared. The cast lives here rather than at a dozen
 * call sites, and it is the point: the schema has to hold on its own, because
 * the plugin it is checking was not compiled against our types.
 */
function parse(...definitions: Record<string, unknown>[]) {
  return defineProperties(definitions as unknown as PropertyDefinitionInput[])
}

describe("what it accepts", () => {
  it("takes a minimal definition and fills in the rest", () => {
    const [parsed] = parse(property())

    // The booleans default to off, so a property is plain unless it says so.
    expect(parsed).toMatchObject({ responsive: false, states: false, advanced: false })
  })

  it("takes units on every control whose value is a length", () => {
    for (const control of ["dimension", "spacing", "radius"]) {
      expect(() => parse(property({ control, units: ["px"] }))).not.toThrow()
    }
  })

  it("takes the same key on both sides, because a prop and a style are different places", () => {
    /*
     * `backgroundImage` is genuinely both: the CSS property, and the asset prop
     * that produces it. Keying uniqueness on the target as well as the name is
     * what lets a component expose both without one shadowing the other.
     */
    expect(() =>
      parse(
        property({ key: "backgroundImage", target: "style", control: "asset" }),
        property({ key: "backgroundImage", target: "prop", control: "asset" }),
      ),
    ).not.toThrow()
  })
})

describe("what it refuses", () => {
  it("a select with nothing to select", () => {
    expect(() => parse(property({ control: "select" }))).toThrow(/needs options/)
  })

  it("options on something that is not a select", () => {
    expect(() => parse(property({ options: [{ value: "a", label: "A" }] }))).toThrow(
      /Only a select/,
    )
  })

  it("units on a colour, where a unit picker could not be used", () => {
    expect(() => parse(property({ control: "color", units: ["px"] }))).toThrow(/length property/)
  })

  it("a minimum above its maximum", () => {
    expect(() => parse(property({ min: 10, max: 2 }))).toThrow(/cannot exceed/)
  })

  it("a responsive prop, which the schema has nowhere to store", () => {
    /*
     * The document holds per-breakpoint and per-state overrides for styles and
     * not for props. A prop claiming to be responsive would offer the user a
     * breakpoint override with nowhere to put it.
     */
    expect(() => parse(property({ target: "prop", key: "text", responsive: true }))).toThrow(
      /Only a style property/,
    )
  })

  it("a stateful prop, for the same reason", () => {
    expect(() => parse(property({ target: "prop", key: "text", states: true }))).toThrow(
      /Only a style property/,
    )
  })

  it("the same key twice, where the second would win in silence", () => {
    expect(() => parse(property(), property())).toThrow(/defined twice/)
  })

  it("the same key twice where only one of them is conditional", () => {
    // One unconditional declaration is always on screen, so it is always in a
    // fight with the other.
    expect(() =>
      parse(property(), property({ showWhen: { key: "provider", equals: "youtube" } })),
    ).toThrow(/defined twice/)
  })

  it("the same key twice under conditions that can both be true", () => {
    expect(() =>
      parse(
        property({ showWhen: { key: "provider", equals: "youtube" } }),
        property({ showWhen: { key: "kind", equals: "video" } }),
      ),
    ).toThrow(/defined twice/)
  })

  it("the same key twice under the same value of one question", () => {
    expect(() =>
      parse(
        property({ showWhen: { key: "provider", equals: "youtube" } }),
        property({ showWhen: { key: "provider", equals: "youtube" } }),
      ),
    ).toThrow(/defined twice/)
  })

  it("the same key twice where one tests `not`, which two of can both be true", () => {
    expect(() =>
      parse(
        property({ showWhen: { key: "provider", equals: "youtube" } }),
        property({ showWhen: { key: "provider", not: "vimeo" } }),
      ),
    ).toThrow(/defined twice/)
  })
})

describe("what it allows", () => {
  it("one key declared once per answer to the same question", () => {
    /*
     * Embed's `id` is "Video ID" for YouTube and "Booking link" for Cal.com,
     * and a single field labelled "ID" would be one nobody can fill in without
     * guessing. At most one is ever on screen, so nothing wins silently — and
     * this rule rejected it until the inspector tried to import the module and
     * found it had never been loadable.
     */
    expect(() =>
      parse(
        property({ showWhen: { key: "provider", equals: "youtube" } }),
        property({ showWhen: { key: "provider", equals: "vimeo" } }),
        property({ showWhen: { key: "provider", equals: "cal" } }),
      ),
    ).not.toThrow()
  })

  it("a group that is not one of the inspector's sections", () => {
    // A typo would otherwise be a section of one appearing in the panel.
    expect(() => parse(property({ group: "Typograhpy" }))).toThrow()
  })

  it("a field nobody declared", () => {
    // Strict, so a property that meant `help` and wrote `hint` is a failure
    // rather than a help line that never appears.
    expect(() => parse(property({ hint: "oops" }))).toThrow()
  })
})

describe("the inspector's sections", () => {
  it("are the accordion's order, not an alphabetical list", () => {
    // docs/ui-guidelines.md § Inspector. General first because it holds what a
    // component is, Advanced last because it holds what most people never
    // touch.
    expect(PROPERTY_GROUPS[0]).toBe("General")
    expect(PROPERTY_GROUPS.at(-1)).toBe("Advanced")
  })

  it("parse through the single-property schema too", () => {
    const one = property() as unknown as PropertyDefinitionInput

    expect(propertyDefinition.parse(one).group).toBe("Layout")
  })
})

describe("a condition", () => {
  it("shows a property when another has a value", () => {
    expect(propertyCondition.safeParse({ key: "kind", equals: "number" }).success).toBe(true)
  })

  it("shows a property when another does not have a value", () => {
    // "Every value except one" is a real shape — an Input's minimum length
    // applies to four of its five kinds — and equality cannot say it.
    expect(propertyCondition.safeParse({ key: "kind", not: "number" }).success).toBe(true)
  })

  it("refuses a condition that is both", () => {
    expect(
      propertyCondition.safeParse({ key: "kind", equals: "text", not: "number" }).success,
    ).toBe(false)
  })

  it("refuses a condition that is neither", () => {
    expect(propertyCondition.safeParse({ key: "kind" }).success).toBe(false)
  })
})
