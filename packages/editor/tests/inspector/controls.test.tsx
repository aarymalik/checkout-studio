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

  it("says so for a length it cannot show as a number", () => {
    const { container } = render(<Control definition={GAP} value="auto" onChange={vi.fn()} />)

    expect(container.querySelector('[data-inspector-unbuilt="dimension"]')).not.toBeNull()
    expect(screen.getByText(/auto is not a plain length/)).toBeVisible()
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
})
