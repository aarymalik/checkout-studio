import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, formatShadow, parseShadow } from "../../src/inspector"

/**
 * The shadow control.
 *
 * A shadow is four things somebody adjusts — across, down, blur, colour — and
 * the two the value may or may not carry, a spread and `inset`. Both a box
 * shadow and a text shadow register as `control: "shadow"` and nothing in a
 * property definition says which is which, so the control shows the parts the
 * value has rather than guessing.
 */

const SHADOW = defineProperties([
  { key: "boxShadow", target: "style", label: "Shadow", group: "Effects", control: "shadow" },
])[0] as PropertyDefinition

describe("reading a shadow", () => {
  it("takes apart what the theme ships", () => {
    // The default theme's `shadows.md`, which is the shape most values take.
    expect(parseShadow("0 4px 12px rgba(10, 10, 10, 0.08)")).toEqual({
      offsetX: "0",
      offsetY: "4px",
      blur: "12px",
      colour: "rgba(10, 10, 10, 0.08)",
      inset: false,
    })
  })

  it("keeps a bracketed colour in one piece", () => {
    /*
     * `rgba(10, 10, 10, 0.08)` has spaces and commas inside it. Split on every
     * space it reads as four tokens, and the control would show a blur of
     * "10," — which is the bug the shared top-level splitter exists to stop.
     */
    expect(parseShadow("0 0 2px rgba(0, 0, 0, 0.5)")?.colour).toBe("rgba(0, 0, 0, 0.5)")
  })

  it("reads a spread when there is one", () => {
    expect(parseShadow("1px 2px 3px 4px red")).toMatchObject({ spread: "4px", colour: "red" })
  })

  it("leaves the spread absent when there is none", () => {
    // A text shadow has no spread, and the control must not offer one — see
    // the round trip below for why that matters.
    expect(parseShadow("1px 2px 3px red")).not.toHaveProperty("spread")
  })

  it("finds inset wherever it sits", () => {
    expect(parseShadow("inset 0 1px 2px red")?.inset).toBe(true)
    expect(parseShadow("0 1px 2px red inset")?.inset).toBe(true)
  })

  it("fills in a blur nobody wrote", () => {
    expect(parseShadow("1px 2px red")?.blur).toBe("0")
  })

  it.each(["none", "", "   "])("reads %s as no shadow at all", (value) => {
    expect(parseShadow(value)).toBeNull()
  })

  it("refuses a list of two shadows", () => {
    // Four boxes cannot describe two shadows, and a control that showed the
    // first would delete the second the moment anybody touched it.
    expect(parseShadow("0 1px 2px red, 0 2px 4px blue")).toBeNull()
  })

  it("refuses something that is not a shadow", () => {
    expect(parseShadow("4px")).toBeNull()
    expect(parseShadow(42)).toBeNull()
  })
})

describe("writing a shadow", () => {
  it.each(["0 4px 12px rgba(10, 10, 10, 0.08)", "1px 2px 3px 4px red", "inset 0 1px 2px red"])(
    "round trips %s unchanged",
    (value) => {
      /*
       * The round trip is the guarantee. A text shadow that came in without a
       * spread goes out without one, so this control never writes a declaration
       * the browser would drop.
       */
      const shadow = parseShadow(value)

      expect(shadow).not.toBeNull()
      expect(formatShadow(shadow as NonNullable<typeof shadow>)).toBe(value)
    },
  )
})

describe("the control", () => {
  function control(initial: string, onChange = vi.fn()) {
    function Harness(): ReactElement {
      const [value, setValue] = useState(initial)

      return (
        <Control
          definition={SHADOW}
          value={value}
          onChange={(next) => {
            setValue(String(next))
            onChange(next)
          }}
        />
      )
    }

    render(<Harness />)

    return onChange
  }

  it("offers a box for each part the value has", () => {
    control("0 4px 12px rgba(10, 10, 10, 0.08)")

    expect(screen.getByLabelText("Shadow across")).toHaveValue(0)
    expect(screen.getByLabelText("Shadow down")).toHaveValue(4)
    expect(screen.getByLabelText("Shadow blur")).toHaveValue(12)
    expect(screen.queryByLabelText("Shadow spread")).toBeNull()
  })

  it("offers the spread only when the value had one", () => {
    control("1px 2px 3px 4px red")

    expect(screen.getByLabelText("Shadow spread")).toHaveValue(4)
  })

  it("rebuilds the whole declaration from one box", async () => {
    // CSS has no `box-shadow-blur`, so there is no longhand to write the way a
    // side writes `paddingLeft`.
    const onChange = control("0 4px 12px red")

    await userEvent.clear(screen.getByLabelText("Shadow blur"))
    await userEvent.type(screen.getByLabelText("Shadow blur"), "20")

    expect(onChange).toHaveBeenLastCalledWith("0 4px 20px red")
  })

  it("gives a bare number pixels", async () => {
    /*
     * `4` is not a length, so the declaration would be dropped in silence and
     * the shadow would fall back to the component's default — which looks
     * exactly like the control doing nothing.
     */
    const onChange = control("0 4px 12px red")

    await userEvent.clear(screen.getByLabelText("Shadow down"))
    await userEvent.type(screen.getByLabelText("Shadow down"), "8")

    expect(onChange).toHaveBeenLastCalledWith("0 8px 12px red")
  })

  it("shows none as the text it is", () => {
    /*
     * `none` is what the theme's own `shadows.none` resolves to, and it is not
     * a shadow four boxes can describe.
     */
    control("none")

    expect(screen.getByLabelText("Shadow")).toHaveValue("none")
    expect(screen.queryByLabelText("Shadow blur")).toBeNull()
  })

  it("shows a list as the text it is", () => {
    control("0 1px 2px red, 0 2px 4px blue")

    expect(screen.getByLabelText("Shadow")).toHaveValue("0 1px 2px red, 0 2px 4px blue")
  })

  it("edits a translucent colour as text rather than drawing it black", async () => {
    /*
     * Almost every shadow colour is one of these — the theme's own are
     * `rgba(10, 10, 10, 0.08)` and the rest, because a shadow is nearly always
     * part transparent.
     *
     * The first version passed them to the picker with `#000000` as a
     * fallback, which drew a black swatch over a colour that was neither black
     * nor opaque; the first click would have written that black into the
     * document. The gallery photographed it.
     */
    const onChange = control("0 4px 12px rgba(10, 10, 10, 0.08)")
    const colour = screen.getByLabelText("Shadow colour")

    expect(colour).toHaveValue("rgba(10, 10, 10, 0.08)")

    await userEvent.clear(colour)
    await userEvent.type(colour, "rgba(0, 0, 0, 0.5)")

    expect(onChange).toHaveBeenLastCalledWith("0 4px 12px rgba(0, 0, 0, 0.5)")
  })

  it("offers the picker for a colour it can actually hold", () => {
    control("0 4px 12px #336699")

    /*
     * The picker's trigger, which shows a swatch and the value. Its hex field
     * and sliders live inside a popover and are not in the document until it
     * is opened — so a test looking for them finds nothing and reads as though
     * the picker were missing.
     */
    expect(screen.getByText("#336699")).toBeVisible()
  })

  it("says Mixed rather than showing one selection's shadow", () => {
    render(<Control definition={SHADOW} value="0 4px 12px red" mixed onChange={vi.fn()} />)

    expect(screen.getByText("Mixed")).toBeVisible()
    expect(screen.getByLabelText("Shadow across")).toHaveValue(null)
  })
})
