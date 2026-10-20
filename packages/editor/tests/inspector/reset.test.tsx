import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { Node } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PropertyInspector, ownKeys, shapesOf } from "../../src/inspector"

/**
 * Putting a property back to what the component ships.
 *
 * ## The question this slice answers
 *
 * `valuesFor` deliberately collapses "24px because somebody typed it" with
 * "24px because the component ships it" — what a panel shows is what is in
 * effect, and a fresh Section plainly has padding. Reset is the one feature
 * that has to tell them apart, because offering it on a value nobody changed
 * is a button that does nothing, and a panel where every row carries one says
 * nothing about which rows have been touched.
 */

/*
 * One group, deliberately.
 *
 * The panel opens one section at a time, so a property in a second section is
 * absent from the document whatever this slice does — and a test asserting
 * "no reset for Colour" would pass against a panel that offers resets for
 * everything. The first draft of these tests did exactly that.
 */
const DEFINITIONS = defineProperties([
  { key: "text", target: "prop", label: "Text", group: "General", control: "text" },
  {
    key: "padding",
    target: "style",
    label: "Padding",
    group: "General",
    control: "spacing",
    units: ["px", "rem"],
  },
  { key: "color", target: "style", label: "Colour", group: "General", control: "color" },
]) as readonly PropertyDefinition[]

function node(props: Record<string, unknown>, styles: Record<string, unknown>): Node {
  return {
    id: "nod_1",
    type: "core.section",
    parentId: null,
    children: [],
    props,
    styles: { desktop: { base: styles } },
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  } as Node
}

describe("which properties a node holds itself", () => {
  it("says nothing is held when the node is fresh", () => {
    expect(ownKeys(node({}, {}), DEFINITIONS)).toEqual(new Set())
  })

  it("counts a prop and a style the node set", () => {
    expect(ownKeys(node({ text: "Hi" }, { color: "red" }), DEFINITIONS)).toEqual(
      new Set(["text", "color"]),
    )
  })

  it("counts a side held under any one of its shapes", () => {
    /*
     * One padding is up to five keys. The control writes longhands, so a node
     * whose only own value is `paddingLeft` has overridden its padding — and a
     * reset that did not offer itself there would strand the one side somebody
     * changed, with no way back.
     */
    expect(ownKeys(node({}, { paddingLeft: "4px" }), DEFINITIONS)).toEqual(new Set(["padding"]))
    expect(ownKeys(node({}, { padding: "16px" }), DEFINITIONS)).toEqual(new Set(["padding"]))
  })

  it("reads the base, which is where the panel writes", () => {
    const tabletOnly = {
      ...node({}, {}),
      styles: { tablet: { base: { color: "red" } } },
    } as Node

    expect(ownKeys(tabletOnly, DEFINITIONS)).toEqual(new Set())
  })

  it("names every shape a reset has to remove", () => {
    expect(shapesOf("padding")).toEqual([
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
    ])
    expect(shapesOf("color")).toEqual(["color"])
  })
})

describe("the reset a panel offers", () => {
  function panel(overridden: readonly string[], onReset = vi.fn()) {
    render(
      <PropertyInspector
        definitions={DEFINITIONS}
        values={{ text: "Hi", padding: "16px", color: "red" }}
        overridden={new Set(overridden)}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    )

    return onReset
  }

  it("offers one only where the node holds a value of its own", () => {
    panel(["text"])

    expect(screen.getByRole("button", { name: /Reset Text/ })).toBeVisible()
    expect(screen.queryByRole("button", { name: /Reset Colour/ })).toBeNull()
  })

  it("offers none at all when the panel cannot write", () => {
    // A gallery rendering a panel with nowhere to write is the ordinary case,
    // and a reset that cannot reset is worse than no reset.
    render(
      <PropertyInspector
        definitions={DEFINITIONS}
        values={{ text: "Hi" }}
        overridden={new Set(["text"])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole("button", { name: /Reset/ })).toBeNull()
  })

  it("reports which property was reset", () => {
    const onReset = panel(["text"])

    screen.getByRole("button", { name: /Reset Text/ }).click()

    expect(onReset).toHaveBeenCalledWith(expect.objectContaining({ key: "text" }))
  })

  it("names the property, because eleven buttons called Reset are indistinguishable", () => {
    /*
     * A screen reader reads a button by its accessible name, and a panel of
     * eleven called "Reset" is eleven identical buttons in a list. The visible
     * word stays one short word; the name carries the property.
     */
    panel(["text", "padding"])

    expect(
      screen.getByRole("button", { name: "Reset Padding to the component's default" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Reset Text to the component's default" }),
    ).toBeVisible()
  })

  it("can be reached and fired from the keyboard", () => {
    // Rendered rather than revealed on hover, which is the whole reason it is
    // a quiet button under the control instead of an icon that appears.
    const onReset = panel(["text"])
    const button = screen.getByRole("button", { name: /Reset Text/ })

    button.focus()

    expect(button).toHaveFocus()

    return userEvent.keyboard("{Enter}").then(() => {
      expect(onReset).toHaveBeenCalledTimes(1)
    })
  })
})
