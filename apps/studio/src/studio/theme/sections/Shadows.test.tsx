import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Shadows } from "./Shadows"

/**
 * The Shadows section.
 *
 * Two sliders describe the part of a shadow that carries its elevation. What
 * these protect is everything they do not describe: a colour, a spread, a
 * horizontal offset and `inset` all survive a change to the drop or the blur,
 * rather than being dropped by a control with nowhere to put them.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(<Shadows theme={theme} update={update} />)

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

const shadows = (over: Partial<CheckoutTheme["shadows"]>): CheckoutTheme => ({
  ...defaultTheme,
  shadows: { ...defaultTheme.shadows, ...over },
})

async function nudge(name: string): Promise<void> {
  const slider = screen.getByRole("slider", { name })

  slider.focus()
  await userEvent.keyboard("{ArrowRight}")
}

describe("the drop and the blur", () => {
  it("writes the drop and keeps the colour", async () => {
    // "0 1px 2px rgba(10, 10, 10, 0.06)"
    const update = section()

    await nudge("Small drop")

    expect(written(update).shadows.sm).toBe("0 2px 2px rgba(10, 10, 10, 0.06)")
  })

  it("writes the blur and keeps the drop", async () => {
    const update = section()

    await nudge("Small blur")

    expect(written(update).shadows.sm).toBe("0 1px 3px rgba(10, 10, 10, 0.06)")
  })

  it("changes one step and leaves the rest", async () => {
    const update = section()

    await nudge("Medium drop")

    const next = written(update).shadows

    expect(next.sm).toBe(defaultTheme.shadows.sm)
    expect(next.lg).toBe(defaultTheme.shadows.lg)
    expect(next.xl).toBe(defaultTheme.shadows.xl)
  })
})

describe("what the sliders do not show", () => {
  it("keeps a spread, a horizontal offset and inset", async () => {
    /*
     * The section shows two of a shadow's five parts. A control that wrote
     * only what it showed would turn this into `0 2px 4px rgba(…)` and lose
     * three decisions the merchant made, on a screen they opened to adjust
     * one.
     */
    const update = section(shadows({ md: "inset 2px 4px 8px 1px rgba(0, 0, 0, 0.3)" }))

    await nudge("Medium blur")

    expect(written(update).shadows.md).toBe("inset 2px 4px 9px 1px rgba(0, 0, 0, 0.3)")
  })

  it("names the colour, because it is most of what a shadow is", () => {
    section()

    expect(screen.getByText("rgba(10, 10, 10, 0.06)")).toBeVisible()
  })
})

describe("a shadow two sliders cannot describe", () => {
  it("leaves none as the absence of a shadow", () => {
    section()

    // Four editable steps; `none` is not one of them.
    expect(screen.getAllByRole("slider")).toHaveLength(8)
    expect(screen.queryByRole("slider", { name: /none/i })).toBeNull()
  })

  it("shows a list as the text it is", () => {
    // Two shadows separated by a comma are not what two sliders describe.
    section(shadows({ md: "0 1px 2px #000, 0 4px 8px #333" }))

    expect(screen.getByText("0 1px 2px #000, 0 4px 8px #333")).toBeVisible()
    expect(screen.getAllByRole("slider")).toHaveLength(6)
  })

  it("shows one with a relative length as the text it is", () => {
    section(shadows({ lg: "0 0.5rem 1rem rgba(0, 0, 0, 0.2)" }))

    expect(screen.getByText("0 0.5rem 1rem rgba(0, 0, 0, 0.2)")).toBeVisible()
    expect(screen.getAllByRole("slider")).toHaveLength(6)
  })
})
