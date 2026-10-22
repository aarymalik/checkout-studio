import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { Breakpoint, Node } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PropertyInspector, ownKeys, stylesAt, valuesFor } from "../../src/inspector"

/**
 * Editing one breakpoint while the others stay where they were.
 *
 * ## The order is the browser's, not ours
 *
 * The renderer emits desktop as the base and the narrower breakpoints as
 * `max-width` queries, so a desktop rule is still in force at tablet unless
 * something overrides it. The panel resolves a value the same way — override
 * here, else the wider one, else the component's default — because a panel
 * that resolved it differently would be showing a number the page does not
 * use.
 *
 * ## Not everything is per-breakpoint
 *
 * A prop cannot be: the document stores overrides for styles only. A style
 * that did not ask to be responsive is not either. Both are edited at the base
 * wherever the canvas happens to be, and neither is described as having an
 * override — which is a thing to get wrong quietly, since the control looks
 * identical either way.
 */

const DEFINITIONS = defineProperties([
  { key: "text", target: "prop", label: "Text", group: "General", control: "text" },
  {
    key: "fontSize",
    target: "style",
    label: "Size",
    group: "General",
    control: "dimension",
    units: ["px", "rem"],
    responsive: true,
  },
  {
    key: "padding",
    target: "style",
    label: "Padding",
    group: "General",
    control: "spacing",
    units: ["px"],
    responsive: true,
  },
  {
    key: "overflow",
    target: "style",
    label: "Overflow",
    group: "General",
    control: "select",
    options: [
      { value: "visible", label: "Visible" },
      { value: "hidden", label: "Hidden" },
    ],
  },
]) as readonly PropertyDefinition[]

function node(styles: Partial<Record<Breakpoint, Record<string, unknown>>>): Node {
  return {
    id: "nod_1",
    type: "core.section",
    parentId: null,
    children: [],
    props: {},
    styles: Object.fromEntries(
      Object.entries(styles).map(([breakpoint, bag]) => [breakpoint, { base: bag }]),
    ),
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  } as Node
}

describe("what is in force at a breakpoint", () => {
  it("prefers the override to the wider value", () => {
    const styled = node({ desktop: { fontSize: "32px" }, tablet: { fontSize: "24px" } })

    expect(stylesAt(styled, "tablet")["fontSize"]).toBe("24px")
    expect(stylesAt(styled, "desktop")["fontSize"]).toBe("32px")
  })

  it("falls through to the widest value that says anything", () => {
    /*
     * Mobile inherits through tablet, not only from desktop: the renderer
     * emits both as max-width queries, so a tablet rule is in force at mobile
     * too and a panel that jumped straight to desktop would show a number the
     * page does not use.
     */
    const styled = node({ desktop: { fontSize: "32px" }, tablet: { fontSize: "24px" } })

    expect(stylesAt(styled, "mobile")["fontSize"]).toBe("24px")
  })

  it("leaves a value alone at a breakpoint nothing overrides", () => {
    const styled = node({ desktop: { fontSize: "32px" }, mobile: { padding: "8px" } })

    expect(stylesAt(styled, "mobile")["fontSize"]).toBe("32px")
  })

  it("shows the component's default when no breakpoint says anything", () => {
    const values = valuesFor(node({}), DEFINITIONS, { styles: { fontSize: "16px" } }, "mobile")

    expect(values["fontSize"]).toBe("16px")
  })

  it("assembles a side from whichever breakpoint set it", () => {
    // The four shapes and the cascade at once: a tablet `paddingTop` over a
    // desktop shorthand is the sort of thing a document really holds.
    const values = valuesFor(
      node({ desktop: { padding: "16px" }, tablet: { paddingTop: "4px" } }),
      DEFINITIONS,
      {},
      "tablet",
    )

    expect(values["padding"]).toBe("4px 16px 16px")
  })
})

describe("what counts as overridden", () => {
  it("counts only what this breakpoint holds", () => {
    const styled = node({ desktop: { fontSize: "32px" }, tablet: { padding: "8px" } })

    expect(ownKeys(styled, DEFINITIONS, "tablet")).toEqual(new Set(["padding"]))
    expect(ownKeys(styled, DEFINITIONS, "desktop")).toEqual(new Set(["fontSize"]))
  })

  it("says nothing is overridden at a breakpoint with nothing of its own", () => {
    /*
     * The value on screen at mobile is the desktop one. There is no mobile
     * override to remove, and offering to remove one would suggest the value
     * belongs to mobile when it does not.
     */
    expect(ownKeys(node({ desktop: { fontSize: "32px" } }), DEFINITIONS, "mobile")).toEqual(
      new Set(),
    )
  })

  it("reads a property that never asked to be responsive from the base", () => {
    const styled = node({ desktop: { overflow: "hidden" }, tablet: { overflow: "visible" } })

    // Held at the base, so it reads as held wherever the canvas is — and the
    // panel edits the base, which is where the component said the value lives.
    expect(ownKeys(styled, DEFINITIONS, "tablet").has("overflow")).toBe(true)
    expect(ownKeys(node({ tablet: { overflow: "visible" } }), DEFINITIONS, "tablet")).toEqual(
      new Set(),
    )
  })
})

describe("what the panel says about an override", () => {
  function panel(breakpoint: Breakpoint, overridden: readonly string[]) {
    render(
      <PropertyInspector
        definitions={DEFINITIONS}
        values={{ text: "Hi", fontSize: "24px", overflow: "hidden" }}
        overridden={new Set(overridden)}
        breakpoint={breakpoint}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
  }

  it("marks a property set for this breakpoint, and offers to remove it", () => {
    panel("tablet", ["fontSize"])

    expect(screen.getByText("Set for tablet")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Remove the tablet override for Size" }),
    ).toBeVisible()
  })

  it("says reset, not remove, at the base", () => {
    /*
     * The same gesture, a different sentence. At desktop the component's
     * default comes back; at tablet the desktop value does. A button that said
     * "reset to the default" while putting the desktop value back would be
     * describing something that did not happen.
     */
    panel("desktop", ["fontSize"])

    expect(screen.queryByText(/^Set for/)).toBeNull()
    expect(
      screen.getByRole("button", { name: "Reset Size to the component's default" }),
    ).toBeVisible()
  })

  it("does not call a prop an override, wherever the canvas is", () => {
    // A prop is one value for every breakpoint, so "set for tablet" would be
    // a claim about the document that is not true of it.
    panel("tablet", ["text"])

    expect(
      screen.getByRole("button", { name: "Reset Text to the component's default" }),
    ).toBeVisible()
  })

  it("does not call a non-responsive style an override either", () => {
    panel("tablet", ["overflow"])

    expect(
      screen.getByRole("button", { name: "Reset Overflow to the component's default" }),
    ).toBeVisible()
  })
})
