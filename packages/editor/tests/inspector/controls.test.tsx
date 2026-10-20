import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { useState } from "react"
import type { ReactElement } from "react"

import { Control, columnTracks, parseColumns, parseLength } from "../../src/inspector"

function one(input: Parameters<typeof defineProperties>[0][number]): PropertyDefinition {
  return defineProperties([input])[0] as PropertyDefinition
}

/**
 * A control, wired to state the way the inspector wires it.
 *
 * A controlled input whose `value` never moves snaps back after every
 * keystroke, so typing "24" into a box showing 16 produced a string nothing in
 * the product would ever produce. The first version of these tests did exactly
 * that and read as four broken controls.
 */
function control(definition: PropertyDefinition, initial: unknown, onChange = vi.fn()) {
  function Harness(): ReactElement {
    const [value, setValue] = useState<unknown>(initial)

    return (
      <Control
        definition={definition}
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  render(<Harness />)

  return onChange
}

describe("reading a length", () => {
  it.each([
    ["16px", 16, "px"],
    ["1.5rem", 1.5, "rem"],
    ["100%", 100, "%"],
    ["-4px", -4, "px"],
    ["0", 0, ""],
  ])("reads %s", (value, amount, unit) => {
    expect(parseLength(value)).toEqual({ amount, unit })
  })

  it.each(["auto", "fit-content", "calc(100% - 4px)", "{spacing.5}", "", null])(
    "refuses %s rather than guessing",
    (value) => {
      expect(parseLength(value)).toBeNull()
    },
  )
})

describe("reading a column count", () => {
  it("reads the count out of the track list", () => {
    expect(parseColumns("repeat(3, minmax(0, 1fr))")).toBe(3)
  })

  it("writes the track list a count means", () => {
    /*
     * `minmax(0, 1fr)` rather than `1fr`: a bare `1fr` floors at its content's
     * minimum size, so one long unbroken word makes its column wider than its
     * share and pushes the rest off the page.
     */
    expect(columnTracks(4)).toBe("repeat(4, minmax(0, 1fr))")
  })

  it.each(["repeat(0, minmax(0, 1fr))", "1fr 1fr", "auto", null])("refuses %s", (value) => {
    expect(parseColumns(value)).toBeNull()
  })
})

const GAP = one({
  key: "gap",
  target: "style",
  label: "Gap",
  group: "Spacing",
  control: "dimension",
  units: ["px", "rem", "%"],
})

describe("a length control", () => {
  it("shows the number and the unit apart", async () => {
    const onChange = control(GAP, "16px")

    expect(screen.getByLabelText("Gap")).toHaveValue(16)

    await userEvent.clear(screen.getByLabelText("Gap"))
    await userEvent.type(screen.getByLabelText("Gap"), "24")

    expect(onChange).toHaveBeenLastCalledWith("24px")
  })

  it("puts the unit beside the number, under one label", () => {
    /*
     * What this looked like in the product before it was fixed: the unit
     * picker floated a line above the number it belonged to.
     *
     * `Input` lays its label, its box and its help out in a column, so a
     * picker placed beside *it* is beside the whole stack. The row is the
     * number and the unit; the label is the row's.
     */
    const { container } = render(<Control definition={GAP} value="16px" onChange={vi.fn()} />)

    const row = container.querySelector('[data-inspector-row="gap"]')

    expect(row).not.toBeNull()
    expect(row?.contains(screen.getByLabelText("Gap"))).toBe(true)
    expect(row?.contains(screen.getByRole("combobox"))).toBe(true)

    // The visible one is the row's; the unit picker's own is hidden, so the
    // number is named once rather than twice.
    expect(screen.getByText("Gap").tagName).toBe("LABEL")
  })

  it("keeps the number when the unit changes", async () => {
    /*
     * Somebody switching px to rem means "the same figure in rem", not "start
     * again" — and a control that cleared the number would make the unit
     * picker something to avoid.
     */
    const onChange = control(GAP, "16px")

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "rem" }))

    expect(onChange).toHaveBeenLastCalledWith("16rem")
  })

  it("shows a token rather than editing it", () => {
    /*
     * Most style values in this product are references — a grid's default gap
     * is `{spacing.5}`. Parsed as a number that is NaN, and written back it
     * would replace a reference to the design system with a literal nobody
     * chose.
     */
    const { container } = render(
      <Control definition={GAP} value="{spacing.5}" onChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-inspector-token="gap"]')).not.toBeNull()
    expect(screen.getByText(/From the theme: \{spacing.5\}/)).toBeVisible()
    expect(screen.queryByRole("spinbutton")).toBeNull()
  })

  it.each(["auto", "none"])("shows %s in the unit picker, with no number", (value) => {
    /*
     * The bug the inspector gallery photographed: a Section's Max width read
     * "none is not a plain length." `max-width: none` is what the component
     * ships, so the panel was calling the product's own default a mistake —
     * and offering no way forward, since the row became a notice.
     *
     * A keyword is a unit. That is where somebody looks for "stop capping it",
     * and it is the only place it can go, because it has no number.
     */
    render(<Control definition={GAP} value={value} onChange={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent(value)
    expect(screen.getByLabelText("Gap")).toHaveValue(null)
    expect(screen.queryByText(/not a plain length/)).toBeNull()
  })

  it("takes the property's first real unit when a number is typed over a keyword", async () => {
    /*
     * The box stays live. Typing into a max width of `none` means "cap it at
     * this", and `formatLength(800, "none")` is `none` — so the figure would
     * disappear as it was typed. The alternative, a box disabled while the
     * unit is a keyword, photographed as an ordinary empty box: a control that
     * looks ready and does nothing is worse than no control at all.
     */
    const onChange = control(GAP, "none")

    await userEvent.type(screen.getByLabelText("Gap"), "8")

    expect(onChange).toHaveBeenLastCalledWith("8px")
  })

  it("offers a keyword the property does not list, rather than dropping it", () => {
    // GAP lists px, rem and % — a document holding `fit-content` still shows
    // it, instead of being silently read as the first unit in the list.
    render(<Control definition={GAP} value="fit-content" onChange={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent("fit-content")
  })

  it("takes a number again when a unit is picked over a keyword", async () => {
    const onChange = control(GAP, "none")

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "rem" }))

    expect(onChange).toHaveBeenLastCalledWith("0rem")
  })

  it("edits an expression as the expression it is", async () => {
    /*
     * `calc(100% - 8px)` is one value and no part of it is a number a spinner
     * could hold. Typing it is the only way to edit it; reporting it as not a
     * length would be reporting a working value as a mistake.
     */
    const onChange = vi.fn()

    render(<Control definition={GAP} value="calc(100% - 8px)" onChange={onChange} />)

    const box = screen.getByLabelText("Gap")

    expect(box).toHaveValue("calc(100% - 8px)")

    await userEvent.clear(box)
    await userEvent.type(box, "clamp(1rem, 2vw, 3rem)")

    expect(onChange).toHaveBeenLastCalledWith("clamp(1rem, 2vw, 3rem)")
  })

  it("can be cleared and retyped, which a controlled box otherwise cannot", async () => {
    /*
     * The bug these tests found. Refusing an empty value snapped the box back
     * to the old number after every keystroke, so clearing 16 to type 24 wrote
     * "1624" and the field could not be emptied at all. The control now holds
     * what is being typed and reports only what parses.
     */
    const onChange = control(GAP, "16px")

    await userEvent.clear(screen.getByLabelText("Gap"))
    await userEvent.type(screen.getByLabelText("Gap"), "24")

    expect(onChange).toHaveBeenLastCalledWith("24px")
    expect(screen.getByLabelText("Gap")).toHaveValue(24)
  })

  it("follows an undo rather than fighting it", async () => {
    /*
     * The document can move without anybody typing. The draft resyncs when the
     * value it last saw changes, so the box shows what was undone to.
     */
    function Harness(): ReactElement {
      const [value, setValue] = useState("16px")

      return (
        <div>
          <Control
            definition={GAP}
            value={value}
            onChange={(next) => {
              setValue(String(next))
            }}
          />
          <button
            type="button"
            onClick={() => {
              setValue("4px")
            }}
          >
            Undo
          </button>
        </div>
      )
    }

    render(<Harness />)

    await userEvent.clear(screen.getByLabelText("Gap"))
    await userEvent.type(screen.getByLabelText("Gap"), "99")
    await userEvent.click(screen.getByRole("button", { name: "Undo" }))

    expect(screen.getByLabelText("Gap")).toHaveValue(4)
  })

  it("does not write a value while the box is empty", async () => {
    // Clearing to retype would otherwise write 0 on the way past, and every
    // clear would be an undo entry saying the gap became nothing.
    const onChange = control(GAP, "16px")

    await userEvent.clear(screen.getByLabelText("Gap"))

    expect(onChange).not.toHaveBeenCalled()
  })
})

const COLUMNS = one({
  key: "gridTemplateColumns",
  target: "style",
  label: "Columns",
  group: "Layout",
  control: "columns",
  min: 1,
  max: 6,
})

const LEVEL = one({
  key: "level",
  target: "prop",
  label: "Level",
  group: "General",
  control: "select",
  // The numbers a Heading actually registers, not strings that would have
  // made this test pass without the product working.
  options: [1, 2, 3, 4, 5, 6].map((value) => ({ value, label: `Heading ${String(value)}` })),
})

describe("a select control", () => {
  it("shows the option a numeric value means", () => {
    /*
     * Photographed before it was found: a freshly inserted Heading read
     * "Select…" under Level, though its default is the number 2. An option's
     * value is a primitive and a `<select>` deals in text, so the two never
     * matched.
     */
    control(LEVEL, 2)

    expect(screen.getByRole("combobox")).toHaveTextContent("Heading 2")
  })

  it("writes the option back as the type it was declared with", async () => {
    /*
     * The worse half of the same fault. Choosing a level wrote the string
     * "3", and the renderer coerces anything that is not one of its six
     * numbers to 2 — so picking a heading level changed nothing on the canvas
     * and the panel gave no sign of it.
     */
    const onChange = control(LEVEL, 2)

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Heading 3" }))

    expect(onChange).toHaveBeenLastCalledWith(3)
    expect(screen.getByRole("combobox")).toHaveTextContent("Heading 3")
  })

  it("leaves a string option a string", async () => {
    const alignment = one({
      key: "textAlign",
      target: "style",
      label: "Alignment",
      group: "Typography",
      control: "select",
      options: [
        { value: "start", label: "Start" },
        { value: "center", label: "Centre" },
      ],
    })

    const onChange = control(alignment, "start")

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Centre" }))

    expect(onChange).toHaveBeenLastCalledWith("center")
  })

  it("says Mixed rather than showing one selection's answer", () => {
    render(<Control definition={LEVEL} value={2} mixed onChange={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent("Mixed")
  })
})

describe("a columns control", () => {
  it("shows a count and stores a track list", async () => {
    const onChange = control(COLUMNS, "repeat(2, minmax(0, 1fr))")

    expect(screen.getByLabelText("Columns")).toHaveValue(2)

    await userEvent.clear(screen.getByLabelText("Columns"))
    await userEvent.type(screen.getByLabelText("Columns"), "3")

    expect(onChange).toHaveBeenLastCalledWith("repeat(3, minmax(0, 1fr))")
  })

  it("will not go past the maximum the component set", async () => {
    const onChange = control(COLUMNS, "repeat(2, minmax(0, 1fr))")

    await userEvent.clear(screen.getByLabelText("Columns"))
    await userEvent.type(screen.getByLabelText("Columns"), "9")

    expect(onChange).toHaveBeenLastCalledWith("repeat(6, minmax(0, 1fr))")
  })
})

const LINK = one({ key: "href", target: "prop", label: "Link", group: "General", control: "url" })

describe("a url control", () => {
  it("takes an address", async () => {
    const onChange = control(LINK, "")

    await userEvent.type(screen.getByLabelText("Link"), "https://example.test")

    expect(onChange).toHaveBeenLastCalledWith("https://example.test")
  })

  it("refuses one that would run script, rather than storing it to sanitise later", async () => {
    /*
     * The same check the components use before a value reaches an `href`, so
     * what the inspector accepts and what a page renders cannot drift.
     */
    const onChange = control(LINK, "")

    await userEvent.type(screen.getByLabelText("Link"), "javascript:alert(1)")

    for (const call of onChange.mock.calls) {
      expect(String(call[0])).not.toContain("javascript:")
    }
  })
})

describe("a colour control", () => {
  const FILL = one({
    key: "backgroundColor",
    target: "style",
    label: "Background",
    group: "Background",
    control: "color",
  })

  it("is offered for a literal", () => {
    render(<Control definition={FILL} value="#2563eb" onChange={vi.fn()} />)

    expect(screen.getByLabelText("Background")).toBeInTheDocument()
  })

  it("shows a token rather than editing it", () => {
    const { container } = render(
      <Control definition={FILL} value="{colors.primary}" onChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-inspector-token="backgroundColor"]')).not.toBeNull()
  })

  it.each(["red", "rgb(0 0 0 / 50%)", "currentColor"])(
    "edits %s as text rather than taking the panel down",
    async (value) => {
      /*
       * All valid CSS, none of them hex, and the picker needs hex to place its
       * sliders. Handing it one of these does not degrade — `parseHex` throws
       * on anything that is not three or six hex digits, so one row's value
       * took the whole inspector with it.
       *
       * A document imported from somewhere else is how a colour arrives
       * written this way.
       */
      const onChange = vi.fn()

      render(<Control definition={FILL} value={value} onChange={onChange} />)

      const box = screen.getByLabelText("Background")

      expect(box).toHaveValue(value)

      await userEvent.clear(box)
      await userEvent.type(box, "teal")

      expect(onChange).toHaveBeenLastCalledWith("teal")
    },
  )
})
