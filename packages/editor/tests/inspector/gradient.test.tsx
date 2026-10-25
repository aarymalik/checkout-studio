import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, formatGradient, parseGradient } from "../../src/inspector"

/**
 * The gradient control.
 *
 * A direction and a list of colours, and a picture of what they add up to —
 * which is the part that makes it editable at all. Every other control in the
 * panel shows the value it holds; a gradient shown only as its text is the one
 * property somebody would have to publish to see.
 */

const GRADIENT = defineProperties([
  { key: "gradient", target: "prop", label: "Gradient", group: "Effects", control: "gradient" },
])[0] as PropertyDefinition

describe("reading a gradient", () => {
  it("takes apart an angle and two colours", () => {
    expect(parseGradient("linear-gradient(90deg, #ff0000, #0000ff)")).toEqual({
      kind: "linear",
      direction: "90deg",
      stops: [{ colour: "#ff0000" }, { colour: "#0000ff" }],
    })
  })

  it("reads a position when a stop names one", () => {
    expect(parseGradient("linear-gradient(90deg, #ff0000, #0000ff 60%)")?.stops[1]).toEqual({
      colour: "#0000ff",
      position: "60%",
    })
  })

  it("knows a first colour from a first direction", () => {
    /*
     * The direction is optional, so the first argument is either one. `to
     * right` and `circle` are words, `90deg` is an angle, and a colour is
     * neither — except the named ones, which is why this asks what the part
     * starts with.
     */
    expect(parseGradient("linear-gradient(red, blue)")?.direction).toBe("")
    expect(parseGradient("linear-gradient(red, blue)")?.stops).toHaveLength(2)
    expect(parseGradient("linear-gradient(to right, red, blue)")?.direction).toBe("to right")
  })

  it("keeps a bracketed colour in one piece", () => {
    // `rgba(0, 0, 0, 0.5)` has commas inside it, and the arguments are split
    // on commas. Split naively, one stop reads as four.
    const gradient = parseGradient("linear-gradient(90deg, rgba(0, 0, 0, 0.5), white)")

    expect(gradient?.stops).toHaveLength(2)
    expect(gradient?.stops[0]?.colour).toBe("rgba(0, 0, 0, 0.5)")
  })

  it("reads a radial shape as the direction it occupies", () => {
    expect(parseGradient("radial-gradient(circle at center, red, blue)")).toMatchObject({
      kind: "radial",
      direction: "circle at center",
    })
  })

  it.each(["conic-gradient(red, blue)", "linear-gradient(90deg, red)", "var(--brand)", "none"])(
    "refuses %s, which is not a direction and a list",
    (value) => {
      expect(parseGradient(value)).toBeNull()
    },
  )

  it("refuses something that is not a string", () => {
    expect(parseGradient(42)).toBeNull()
  })
})

describe("writing a gradient", () => {
  it.each([
    "linear-gradient(90deg, #ff0000, #0000ff)",
    "linear-gradient(90deg, #ff0000, #0000ff 60%)",
    "linear-gradient(red, blue)",
    "radial-gradient(circle at center, red, blue)",
    "linear-gradient(90deg, rgba(0, 0, 0, 0.5), white)",
  ])("round trips %s unchanged", (value) => {
    const gradient = parseGradient(value)

    expect(gradient).not.toBeNull()
    expect(formatGradient(gradient as NonNullable<typeof gradient>)).toBe(value)
  })
})

describe("the control", () => {
  function control(initial: string, onChange = vi.fn()) {
    function Harness(): ReactElement {
      const [value, setValue] = useState(initial)

      return (
        <Control
          definition={GRADIENT}
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

  it("paints what the value means", () => {
    // The whole reason this control is more than a text box.
    const { container } = render(
      <Control
        definition={GRADIENT}
        value="linear-gradient(90deg, #ff0000, #0000ff)"
        onChange={vi.fn()}
      />,
    )

    const preview = container.querySelector('[data-inspector-gradient="gradient"]')

    expect(preview).toHaveStyle({
      backgroundImage: "linear-gradient(90deg, #ff0000, #0000ff)",
    })
  })

  it("paints nothing for a value that could end the declaration", () => {
    /*
     * The value lands in an inline style, so one carrying a semicolon could
     * end that declaration and begin another. A blank preview is a far better
     * outcome than a panel rendering something nobody wrote.
     */
    const { container } = render(
      <Control
        definition={GRADIENT}
        value="linear-gradient(90deg, red; color: blue, blue)"
        onChange={vi.fn()}
      />,
    )

    const preview = container.querySelector('[data-inspector-gradient="gradient"]')

    expect(preview?.getAttribute("style")).toBeNull()
  })

  it("offers a box per colour", () => {
    control("linear-gradient(90deg, #ff0000, #0000ff)")

    expect(screen.getByLabelText("Gradient colour 1")).toHaveValue("#ff0000")
    expect(screen.getByLabelText("Gradient colour 2")).toHaveValue("#0000ff")
  })

  it("rebuilds the whole value from one box", async () => {
    const onChange = control("linear-gradient(90deg, #ff0000, #0000ff)")

    await userEvent.clear(screen.getByLabelText("Gradient colour 1"))
    await userEvent.type(screen.getByLabelText("Gradient colour 1"), "black")

    expect(onChange).toHaveBeenLastCalledWith("linear-gradient(90deg, black, #0000ff)")
  })

  it("holds an emptied colour rather than writing one", async () => {
    /*
     * An empty colour is not a stop, and committing one makes the whole value
     * unparseable — so the control would collapse to a text box while
     * somebody was halfway through retyping a colour.
     */
    const onChange = control("linear-gradient(90deg, #ff0000, #0000ff)")

    await userEvent.clear(screen.getByLabelText("Gradient colour 1"))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Gradient colour 1")).toHaveValue("")
  })

  it("adds a colour where it can be seen", async () => {
    // The last colour again, rather than a transparent gap somebody has to go
    // looking for.
    const onChange = control("linear-gradient(90deg, red, blue)")

    await userEvent.click(screen.getByRole("button", { name: "Add a colour" }))

    expect(onChange).toHaveBeenLastCalledWith("linear-gradient(90deg, red, blue, blue)")
  })

  it("removes the one that was asked for", async () => {
    const onChange = control("linear-gradient(90deg, red, blue, green)")

    await userEvent.click(screen.getByRole("button", { name: "Remove Gradient colour 2" }))

    expect(onChange).toHaveBeenLastCalledWith("linear-gradient(90deg, red, green)")
  })

  it("refuses to go below two, rather than hiding the button", () => {
    /*
     * CSS wants two and so does the idea. A disabled control that says why is
     * a smaller surprise than a row that loses its last button without
     * explanation.
     */
    control("linear-gradient(90deg, red, blue)")

    expect(screen.getByRole("button", { name: "Remove Gradient colour 1" })).toBeDisabled()
  })

  it("shows a gradient it cannot take apart as the text it is", () => {
    control("conic-gradient(red, blue)")

    expect(screen.getByLabelText("Gradient")).toHaveValue("conic-gradient(red, blue)")
  })

  it("says Mixed rather than showing one selection's gradient", () => {
    render(
      <Control
        definition={GRADIENT}
        value="linear-gradient(90deg, red, blue)"
        mixed
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Mixed")).toBeVisible()
  })
})
