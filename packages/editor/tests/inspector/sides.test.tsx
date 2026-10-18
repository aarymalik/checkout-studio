import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, formatSides, parseSides } from "../../src/inspector"

const PADDING = defineProperties([
  {
    key: "padding",
    target: "style",
    label: "Padding",
    group: "Spacing",
    control: "spacing",
    units: ["px", "rem", "%", "auto"],
  },
])[0] as PropertyDefinition

const RADIUS = defineProperties([
  { key: "borderRadius", target: "style", label: "Radius", group: "Border", control: "radius" },
])[0] as PropertyDefinition

describe("reading a shorthand", () => {
  it.each([
    ["16px", { top: "16px", right: "16px", bottom: "16px", left: "16px" }],
    ["16px 8px", { top: "16px", right: "8px", bottom: "16px", left: "8px" }],
    ["16px 8px 4px", { top: "16px", right: "8px", bottom: "4px", left: "8px" }],
    ["1px 2px 3px 4px", { top: "1px", right: "2px", bottom: "3px", left: "4px" }],
    ["0 auto", { top: "0", right: "auto", bottom: "0", left: "auto" }],
  ])("reads %s", (value, expected) => {
    expect(parseSides(value)).toEqual(expected)
  })

  it("leaves a value with brackets in it alone", () => {
    /*
     * `calc(100% - 8px)` has two spaces in it and is one value. Splitting on
     * every space would read it as three sides and turn a working padding into
     * nonsense.
     */
    expect(parseSides("calc(100% - 8px)")).toEqual({
      top: "calc(100% - 8px)",
      right: "calc(100% - 8px)",
      bottom: "calc(100% - 8px)",
      left: "calc(100% - 8px)",
    })
  })

  it("refuses more than four", () => {
    expect(parseSides("1px 2px 3px 4px 5px")).toBeNull()
  })
})

describe("writing a shorthand", () => {
  it.each([
    [{ top: "8px", right: "8px", bottom: "8px", left: "8px" }, "8px"],
    [{ top: "8px", right: "4px", bottom: "8px", left: "4px" }, "8px 4px"],
    [{ top: "8px", right: "4px", bottom: "2px", left: "4px" }, "8px 4px 2px"],
    [{ top: "1px", right: "2px", bottom: "3px", left: "4px" }, "1px 2px 3px 4px"],
  ])("writes the shortest form that means %o", (sides, expected) => {
    // What somebody would have typed, and what the next person will read.
    expect(formatSides(sides)).toBe(expected)
  })

  it("treats an empty side as nothing rather than dropping it", () => {
    expect(formatSides({ top: "8px", right: "", bottom: "", left: "" })).toBe("8px 0 0")
  })
})

function sides(definition: PropertyDefinition, initial: string, onChange = vi.fn()) {
  function Harness(): ReactElement {
    const [value, setValue] = useState(initial)

    return (
      <Control
        definition={definition}
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

describe("a padding control", () => {
  it("offers one box per side", () => {
    /*
     * The bug this fixes: padding was drawn as a single length, so one number
     * went to all four sides and there was no way to set one of them.
     */
    sides(PADDING, "16px 8px")

    expect(screen.getByLabelText("Padding top")).toHaveValue("16px")
    expect(screen.getByLabelText("Padding right")).toHaveValue("8px")
    expect(screen.getByLabelText("Padding bottom")).toHaveValue("16px")
    expect(screen.getByLabelText("Padding left")).toHaveValue("8px")
  })

  it("changes one side without touching the others", async () => {
    const onChange = sides(PADDING, "16px")

    await userEvent.clear(screen.getByLabelText("Padding left"))
    await userEvent.type(screen.getByLabelText("Padding left"), "4px")

    expect(onChange).toHaveBeenLastCalledWith("16px 16px 16px 4px")
  })

  it("takes auto, which a number box would refuse", async () => {
    const onChange = sides(PADDING, "0")

    await userEvent.clear(screen.getByLabelText("Padding right"))
    await userEvent.type(screen.getByLabelText("Padding right"), "auto")

    expect(onChange).toHaveBeenLastCalledWith("0 auto 0 0")
  })

  it("reads a shorthand back, which the old control could not", () => {
    // A component whose padding was `16px 8px` showed an empty box, because a
    // shorthand is not a length.
    sides(PADDING, "16px 8px 4px 2px")

    expect(screen.getByLabelText("Padding top")).toHaveValue("16px")
    expect(screen.getByLabelText("Padding right")).toHaveValue("8px")
    expect(screen.getByLabelText("Padding bottom")).toHaveValue("4px")
    expect(screen.getByLabelText("Padding left")).toHaveValue("2px")
  })

  it("shows a token rather than four empty boxes", () => {
    const { container } = render(
      <Control definition={PADDING} value="{spacing.4}" onChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-inspector-token="padding"]')).not.toBeNull()
  })
})

describe("a radius control", () => {
  it("names its boxes as corners, because that is what they are", () => {
    sides(RADIUS, "4px")

    expect(screen.getByLabelText("Radius top left")).toHaveValue("4px")
    expect(screen.getByLabelText("Radius bottom right")).toHaveValue("4px")
  })
})
