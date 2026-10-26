import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Radius } from "./Radius"

/**
 * The Radius section.
 *
 * Three values a person chooses, and two that are what "square" and "round"
 * mean. What these protect is that the two are not offered as choices and that
 * a radius written in some other unit is not dragged onto a pixel scale.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(<Radius theme={theme} update={update} />)

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

const radius = (over: Partial<CheckoutTheme["radius"]>): CheckoutTheme => ({
  ...defaultTheme,
  radius: { ...defaultTheme.radius, ...over },
})

describe("the three a person chooses", () => {
  it("offers each of them and writes pixels", async () => {
    const update = section()

    const slider = screen.getByRole("slider", { name: "Medium" })

    slider.focus()
    await userEvent.keyboard("{ArrowRight}")

    // 10px by default, so one step right is 11px.
    expect(written(update).radius.md).toBe("11px")
  })

  it("leaves the other two alone", async () => {
    const update = section()

    const slider = screen.getByRole("slider", { name: "Small" })

    slider.focus()
    await userEvent.keyboard("{ArrowRight}")

    const next = written(update).radius

    expect(next.md).toBe(defaultTheme.radius.md)
    expect(next.lg).toBe(defaultTheme.radius.lg)
  })
})

describe("square and round", () => {
  it("are not offered as choices, because neither is one", () => {
    section()

    expect(screen.queryByRole("slider", { name: /none|full|square|round/i })).toBeNull()
    expect(screen.getAllByRole("slider")).toHaveLength(3)
  })

  it("are named, so the vocabulary is complete rather than half-shown", () => {
    section()

    expect(screen.getByText(/Square is 0 and round is 9999px/)).toBeVisible()
  })
})

describe("a radius this section cannot put on a slider", () => {
  it("shows a relative unit as written, because per cent is not a length", () => {
    /*
     * A radius in per cent is relative to the box it is on, so `10%` beside a
     * 36px preview square would be showing a number that means something
     * different on every element it reaches.
     */
    section(radius({ md: "10%" }))

    expect(screen.getByText("10%")).toBeVisible()
    expect(screen.getAllByRole("slider")).toHaveLength(2)
  })

  it("shows a length in another unit as written", () => {
    section(radius({ lg: "0.5rem" }))

    expect(screen.getByText("0.5rem")).toBeVisible()
  })

  it("shows one past the top of the scale as written rather than clamping it", () => {
    // Clamping would silently change a value the merchant chose, on a screen
    // they only opened to look at.
    section(radius({ lg: "64px" }))

    expect(screen.getByText("64px")).toBeVisible()
    expect(screen.getAllByRole("slider")).toHaveLength(2)
  })
})
