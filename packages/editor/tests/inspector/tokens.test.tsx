import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { defaultTheme } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, pathOf, takesTokens, tokensFor } from "../../src/inspector"

function one(input: Parameters<typeof defineProperties>[0][number]): PropertyDefinition {
  return defineProperties([input])[0] as PropertyDefinition
}

const COLOUR = one({
  key: "color",
  target: "style",
  label: "Colour",
  group: "Typography",
  control: "color",
})

const GAP = one({
  key: "gap",
  target: "style",
  label: "Gap",
  group: "Spacing",
  control: "dimension",
  units: ["px", "rem"],
})

describe("which tokens a property may hold", () => {
  it("offers a colour the theme's colours and nothing else", () => {
    /*
     * A theme has around sixty tokens and a colour property can use eight. A
     * list that offered all sixty would be a list somebody reads carefully
     * every time, and there is no sense in which a colour is `{spacing.4}`.
     */
    const tokens = tokensFor(defaultTheme, "color")

    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) expect(token.startsWith("colors.")).toBe(true)
  })

  it("offers a length the spacing scale before the radii", () => {
    // A gap is usually a step on the scale and sometimes a radius, so the
    // common one comes first.
    const tokens = tokensFor(defaultTheme, "dimension")

    expect(tokens[0]?.startsWith("spacing.")).toBe(true)
    expect(tokens.some((token) => token.startsWith("radius."))).toBe(true)
  })

  it("offers nothing to a control that cannot hold one", () => {
    expect(takesTokens("text")).toBe(false)
    expect(takesTokens("toggle")).toBe(false)
    expect(tokensFor(defaultTheme, "text")).toEqual([])
  })

  it("reads a reference, and refuses anything else", () => {
    expect(pathOf("{colors.primary}")).toBe("colors.primary")
    expect(pathOf("#2563eb")).toBeNull()
    expect(pathOf(16)).toBeNull()
  })
})

function control(definition: PropertyDefinition, initial: unknown, onChange = vi.fn()) {
  function Harness(): ReactElement {
    const [value, setValue] = useState<unknown>(initial)

    return (
      <Control
        definition={definition}
        value={value}
        theme={defaultTheme}
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

describe("a property following the theme", () => {
  it("is the picker, with no box to type in", () => {
    /*
     * The bug this replaces: a number box asked to show `{spacing.5}` showed
     * nothing, and anything typed into it replaced a reference to the design
     * system with a literal nobody chose.
     */
    control(GAP, "{spacing.5}")

    expect(screen.getByRole("combobox", { name: "Gap" })).toBeInTheDocument()
    expect(screen.queryByRole("spinbutton")).toBeNull()
  })

  it("says what the token is currently worth", () => {
    control(COLOUR, "{colors.primary}")

    expect(screen.getByText(/From the theme — #4f46e5/)).toBeVisible()
  })

  it("stores a reference when a token is chosen, not the value it resolves to", async () => {
    const onChange = control(COLOUR, "#ff0000")

    await userEvent.click(screen.getByRole("combobox", { name: /Use a theme token/ }))
    await userEvent.click(screen.getByRole("option", { name: "colors.primary" }))

    expect(onChange).toHaveBeenLastCalledWith("{colors.primary}")
  })
})

describe("detaching", () => {
  it("keeps what the token was worth", async () => {
    /*
     * A detach that cleared the value would read as the control emptying
     * itself. The page should not change the moment a property stops
     * following the theme — only its future.
     */
    const onChange = control(COLOUR, "{colors.primary}")

    await userEvent.click(screen.getByRole("combobox", { name: "Colour" }))
    await userEvent.click(screen.getByRole("option", { name: "Custom value…" }))

    expect(onChange).toHaveBeenLastCalledWith("#4f46e5")
  })

  it("then offers the ordinary control, and the way back", async () => {
    const { container } = render(
      <Control definition={GAP} value="16px" theme={defaultTheme} onChange={vi.fn()} />,
    )

    expect(container.querySelector('[data-inspector-detached="gap"]')).not.toBeNull()
    expect(screen.getByLabelText("Gap")).toHaveValue(16)
    expect(screen.getByRole("combobox", { name: /Use a theme token/ })).toBeInTheDocument()
  })

  it("reattaches when a token is chosen again", async () => {
    const onChange = control(GAP, "16px")

    await userEvent.click(screen.getByRole("combobox", { name: /Use a theme token/ }))
    await userEvent.click(screen.getByRole("option", { name: "spacing.4" }))

    expect(onChange).toHaveBeenLastCalledWith("{spacing.4}")
  })
})

describe("without a theme", () => {
  it("offers literals rather than failing", () => {
    // A panel rendered without a document still works; it just has no tokens
    // to offer.
    render(<Control definition={GAP} value="16px" onChange={vi.fn()} />)

    expect(screen.getByLabelText("Gap")).toHaveValue(16)
    expect(screen.queryByRole("combobox", { name: /theme token/ })).toBeNull()
  })
})
