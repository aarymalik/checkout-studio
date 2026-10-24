import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, formatBorder, parseBorder, stylesFor } from "../../src/inspector"

/**
 * The border control.
 *
 * A width, a style and a colour. The style carries `none`, which is where a
 * border differs from a shadow: `box-shadow: none` is the absence of a shadow
 * and there is nothing for a control to show, while `border: none` is a border
 * whose style is none — the same word in the same place in the same shorthand.
 */

const BORDER = defineProperties([
  { key: "border", target: "style", label: "Border", group: "Border", control: "border" },
])[0] as PropertyDefinition

describe("reading a border", () => {
  it("takes apart the ordinary shape", () => {
    expect(parseBorder("1px solid #e5e5e5")).toEqual({
      width: "1px",
      style: "solid",
      colour: "#e5e5e5",
    })
  })

  it.each(["1px solid red", "solid 1px red", "red 1px solid"])(
    "does not care what order %s is written in",
    (value) => {
      /*
       * All three are the same border to a browser. Each part is recognised by
       * what it is — a length is the width, a word from the style list is the
       * style, the rest is the colour — rather than by where it sits.
       */
      expect(parseBorder(value)).toEqual({ width: "1px", style: "solid", colour: "red" })
    },
  )

  it("reads none as a style rather than as nothing", () => {
    expect(parseBorder("none")).toEqual({ width: "", style: "none", colour: "" })
  })

  it("keeps a bracketed colour in one piece", () => {
    expect(parseBorder("2px dashed rgba(0, 0, 0, 0.2)")?.colour).toBe("rgba(0, 0, 0, 0.2)")
  })

  it("takes a width on its own", () => {
    // Valid CSS: the style defaults to none, so it draws nothing — but it is
    // still a width somebody wrote and the control should not discard it.
    expect(parseBorder("2px")).toEqual({ width: "2px", style: "", colour: "" })
  })

  it("refuses something that is none of the three", () => {
    expect(parseBorder("inherit")).toBeNull()
    expect(parseBorder("")).toBeNull()
    expect(parseBorder(7)).toBeNull()
  })
})

describe("writing a border", () => {
  it("writes none alone", () => {
    /*
     * A width and a colour beside a style of `none` describe a border that is
     * not drawn. Keeping them means the document carries a measurement for
     * something invisible, which reads next time as a border that has lost
     * its style.
     */
    expect(formatBorder({ width: "1px", style: "none", colour: "red" })).toBe("none")
  })

  it("leaves out the parts that are not there", () => {
    expect(formatBorder({ width: "1px", style: "solid", colour: "" })).toBe("1px solid")
  })

  it.each(["1px solid #e5e5e5", "none", "2px dashed rgba(0, 0, 0, 0.2)"])(
    "round trips %s unchanged",
    (value) => {
      const border = parseBorder(value)

      expect(border).not.toBeNull()
      expect(formatBorder(border as NonNullable<typeof border>)).toBe(value)
    },
  )
})

describe("the styles on offer", () => {
  it("is the short list for an ordinary border", () => {
    expect(stylesFor({ width: "1px", style: "solid", colour: "" })).toEqual([
      "none",
      "solid",
      "dashed",
      "dotted",
      "double",
    ])
  })

  it("keeps a style the list does not carry, so a document can return to it", () => {
    /*
     * CSS has nine styles and four of them draw a bevel nobody asks for. A
     * document already holding one keeps it rather than the list growing four
     * entries for every border in the product.
     */
    expect(stylesFor({ width: "1px", style: "ridge", colour: "" })).toContain("ridge")
  })
})

describe("the control", () => {
  function control(initial: string, onChange = vi.fn()) {
    function Harness(): ReactElement {
      const [value, setValue] = useState(initial)

      return (
        <Control
          definition={BORDER}
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

  it("shows the width and the style side by side", () => {
    control("1px solid #e5e5e5")

    expect(screen.getByLabelText("Border width")).toHaveValue(1)
    expect(screen.getByRole("combobox", { name: "Border style" })).toHaveTextContent("solid")
  })

  it("turns a border on with a width, rather than leaving CSS to pick one", async () => {
    /*
     * A style with no width is `medium` in CSS — three pixels — so a border
     * somebody just switched on would arrive thicker than they asked for and
     * the width box would be empty beside it.
     */
    const onChange = control("none")

    await userEvent.click(screen.getByRole("combobox", { name: "Border style" }))
    await userEvent.click(screen.getByRole("option", { name: "solid" }))

    expect(onChange).toHaveBeenLastCalledWith("1px solid")
  })

  it("writes none alone when the style is turned off", async () => {
    const onChange = control("1px solid red")

    await userEvent.click(screen.getByRole("combobox", { name: "Border style" }))
    await userEvent.click(screen.getByRole("option", { name: "none" }))

    expect(onChange).toHaveBeenLastCalledWith("none")
  })

  it("stops offering a width for a border that is not drawn", () => {
    // A measurement for something invisible is not something to type into.
    control("none")

    expect(screen.getByLabelText("Border width")).toBeDisabled()
  })

  it("hides the colour while the style is none", () => {
    control("none")

    expect(screen.queryByLabelText("Border colour")).toBeNull()
  })

  it("edits a colour the picker cannot hold as text", () => {
    control("1px solid currentColor")

    expect(screen.getByLabelText("Border colour")).toHaveValue("currentColor")
  })

  it("shows something it cannot take apart as the text it is", () => {
    control("inherit")

    expect(screen.getByLabelText("Border")).toHaveValue("inherit")
  })

  it("says Mixed rather than showing one selection's border", () => {
    render(<Control definition={BORDER} value="1px solid red" mixed onChange={vi.fn()} />)

    /*
     * Twice over, and deliberately: the row says it once beside the label, the
     * way the sides and the shadow do, and the style picker says it where its
     * value would be. The width box cannot hold the word — 80 pixels — so it
     * carries the same dash the sides carry.
     */
    expect(screen.getByRole("combobox", { name: "Border style" })).toHaveTextContent("Mixed")
    expect(screen.getByLabelText("Border width")).toHaveValue(null)
    expect(screen.getByLabelText("Border width")).toHaveAttribute("placeholder", "–")
  })
})
