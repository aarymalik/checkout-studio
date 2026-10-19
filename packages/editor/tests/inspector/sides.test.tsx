import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, effectiveSides, formatSides, parseSides } from "../../src/inspector"

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

/**
 * The control, wired the way the application wires it.
 *
 * A style bag rather than one string: the control writes a side's own longhand
 * — `paddingLeft` rather than `padding` — and reads back whatever any of the
 * four shapes set. A harness that held a single shorthand would be testing the
 * bug this fixes.
 */
function sides(
  definition: PropertyDefinition,
  initial: Record<string, string>,
  onChange = vi.fn(),
  defaults: Record<string, string> = {},
) {
  function Harness(): ReactElement {
    const [own, setOwn] = useState<Record<string, string>>(initial)

    return (
      <Control
        definition={definition}
        value={formatSides(effectiveSides(definition.key, own, defaults))}
        onChange={(next, key) => {
          setOwn((current) => ({ ...current, [key ?? definition.key]: String(next) }))
          onChange(next, key)
        }}
      />
    )
  }

  render(<Harness />)

  return onChange
}

describe("a padding control", () => {
  it("offers one box per side, reading whichever shape set it", () => {
    /*
     * A Section ships four `paddingTop`-style defaults; other components ship
     * one `padding`. Reading only the shorthand left half the library showing
     * empty boxes beside a canvas that plainly had padding on it.
     */
    sides(PADDING, {}, vi.fn(), {
      paddingTop: "64px",
      paddingRight: "24px",
      paddingBottom: "64px",
      paddingLeft: "24px",
    })

    expect(screen.getByLabelText("Padding top")).toHaveValue(64)
    expect(screen.getByLabelText("Padding right")).toHaveValue(24)
  })

  it("reads a shorthand too", () => {
    sides(PADDING, { padding: "16px 8px 4px 2px" })

    expect(screen.getByLabelText("Padding top")).toHaveValue(16)
    expect(screen.getByLabelText("Padding bottom")).toHaveValue(4)
  })

  it("writes the side's own longhand, leaving the others alone", async () => {
    /*
     * The bug: writing the `padding` shorthand replaced all four defaults at
     * once, so setting a left padding flattened the top and bottom to nothing.
     */
    const onChange = sides(PADDING, {}, vi.fn(), { padding: "16px" })

    await userEvent.clear(screen.getByLabelText("Padding left"))
    await userEvent.type(screen.getByLabelText("Padding left"), "4")

    expect(onChange).toHaveBeenLastCalledWith("4px", "paddingLeft")
    expect(screen.getByLabelText("Padding top")).toHaveValue(16)
  })

  it("gives a bare number the property's unit", async () => {
    /*
     * Typing `1` stored `1`, which is not a valid CSS length — so the whole
     * declaration was dropped and the padding fell back to the component's
     * default, which looks exactly like every side changing at once.
     */
    const onChange = sides(PADDING, { padding: "16px" })

    await userEvent.clear(screen.getByLabelText("Padding right"))
    await userEvent.type(screen.getByLabelText("Padding right"), "1")

    expect(onChange).toHaveBeenLastCalledWith("1px", "paddingRight")
  })

  it("steps with the arrow keys, which a text box could not", async () => {
    const onChange = sides(PADDING, { padding: "16px" })

    screen.getByLabelText("Padding top").focus()
    await userEvent.keyboard("{ArrowUp}")

    expect(onChange).toHaveBeenLastCalledWith("17px", "paddingTop")

    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}")

    expect(onChange).toHaveBeenLastCalledWith("27px", "paddingTop")
  })

  it("takes auto through the unit, which is where a margin offers it", async () => {
    // A number box cannot hold `auto`, and `0auto` is not a value at all.
    const onChange = sides(PADDING, { padding: "16px" })

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "auto" }))

    expect(onChange).toHaveBeenLastCalledWith("auto", "paddingLeft")
  })

  it("shows a token rather than four empty boxes", () => {
    const { container } = render(
      <Control definition={PADDING} value="{spacing.4}" onChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-inspector-token="padding"]')).not.toBeNull()
  })
})

describe("a radius control", () => {
  it("names its boxes as corners, and writes the matching longhand", async () => {
    const onChange = sides(RADIUS, { borderRadius: "4px" })

    expect(screen.getByLabelText("Radius top left")).toHaveValue(4)

    await userEvent.clear(screen.getByLabelText("Radius bottom right"))
    await userEvent.type(screen.getByLabelText("Radius bottom right"), "8")

    expect(onChange).toHaveBeenLastCalledWith("8px", "borderBottomRightRadius")
  })
})
