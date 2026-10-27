import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Colors } from "./Colors"
import { LABEL, SEMANTIC } from "./semantic"

/**
 * The Colors section.
 *
 * What these protect is reach. Twelve of the theme's thirteen semantic colours
 * had no editor anywhere before this section, so the tests that matter are the
 * ones saying each is present, that writing one leaves the other twelve alone,
 * and that `primary` is not offered twice.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(
    <TooltipProvider>
      <Colors theme={theme} update={update} />
    </TooltipProvider>,
  )

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

describe("what the section reaches", () => {
  it("offers every semantic colour except the brand colour", () => {
    section()

    // Named with the shared labels, so this also fails if Colors and Dark mode
    // ever stop calling the same token the same thing.
    for (const key of SEMANTIC) {
      if (key === "primary") continue
      expect(screen.getByLabelText(LABEL[key])).toBeInTheDocument()
    }

    // Not one for `primary`: Brand owns that, and two editors for one token is
    // two places to look for the same answer.
    expect(screen.queryByLabelText(LABEL.primary)).toBeNull()
    expect(SEMANTIC).toHaveLength(13)
  })

  it("edits a colour the theme cannot express in a picker as text", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, border: "oklch(0.9 0 0)" },
    })

    const field = screen.getByLabelText("Border")

    await userEvent.clear(field)
    await userEvent.type(field, "rebeccapurple")
    await userEvent.tab()

    expect(written(update).colors.border).toBe("rebeccapurple")
  })

  it("leaves every other colour alone when one is written", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, surface: "oklch(0.98 0 0)" },
    })

    const field = screen.getByLabelText("Surface")

    await userEvent.clear(field)
    await userEvent.type(field, "#f5f5f5")
    await userEvent.tab()

    const next = written(update)

    expect(next.colors.surface).toBe("#f5f5f5")
    for (const key of SEMANTIC) {
      if (key === "surface") continue
      expect(next.colors[key]).toBe(defaultTheme.colors[key])
    }
  })

  it("keeps the rest of the theme as it was", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, danger: "oklch(0.6 0.2 25)" },
    })

    const field = screen.getByLabelText("Danger")

    await userEvent.clear(field)
    await userEvent.type(field, "#b91c1c")
    await userEvent.tab()

    const next = written(update)

    expect(next.radius).toEqual(defaultTheme.radius)
    expect(next.typography).toEqual(defaultTheme.typography)
    expect(next.dark).toEqual(defaultTheme.dark)
  })

  it("writes nothing when a text field is left unchanged", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, border: "oklch(0.9 0 0)" },
    })

    await userEvent.click(screen.getByLabelText("Border"))
    await userEvent.tab()

    expect(update).not.toHaveBeenCalled()
  })

  it("reverts a half-typed colour on Escape rather than saving it", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, border: "oklch(0.9 0 0)" },
    })

    const field = screen.getByLabelText("Border")

    await userEvent.clear(field)
    await userEvent.type(field, "oklch(0.9")
    await userEvent.keyboard("{Escape}")

    expect(field).toHaveValue("oklch(0.9 0 0)")
    expect(update).not.toHaveBeenCalled()
  })

  it("says which colours the brand colour works out", () => {
    section()

    // The two that are also derived. A person editing them deserves to know
    // what that means before they pick a brand colour again, not after.
    expect(screen.getByText(/Label on brand and Focus ring/)).toBeInTheDocument()
  })
})

describe("marking what a person chose", () => {
  it("marks a colour it writes", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, border: "oklch(0.9 0 0)" },
    })

    const field = screen.getByLabelText("Border")

    await userEvent.clear(field)
    await userEvent.type(field, "#d4d4d4")
    await userEvent.tab()

    expect(written(update).manual).toEqual(["colors.border"])
  })

  it("keeps marks it did not touch", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, border: "oklch(0.9 0 0)" },
      manual: ["colors.focusRing"],
    })

    const field = screen.getByLabelText("Border")

    await userEvent.clear(field)
    await userEvent.type(field, "#d4d4d4")
    await userEvent.tab()

    expect(written(update).manual).toEqual(["colors.border", "colors.focusRing"])
  })

  it("says whether a derived colour is still derived", () => {
    section()

    // Two derived colours, neither chosen yet.
    expect(screen.getAllByText("Worked out from the brand colour")).toHaveLength(2)
    expect(screen.queryByText("Set by hand")).toBeNull()
  })

  it("says so once a derived colour has been chosen", () => {
    section({ ...defaultTheme, manual: ["colors.focusRing"] })

    expect(screen.getByText("Set by hand")).toBeInTheDocument()
    expect(screen.getAllByText("Worked out from the brand colour")).toHaveLength(1)
  })

  it("says nothing about provenance for a colour nothing derives", () => {
    // Ten of the twelve are nobody's business but the person who set them.
    section({ ...defaultTheme, manual: ["colors.border"] })

    expect(screen.queryByText("Set by hand")).toBeNull()
  })
})

describe("the way back to derived", () => {
  it("is not offered for a colour that is still derived", () => {
    section()

    expect(screen.queryByRole("button", { name: "Use derived" })).toBeNull()
  })

  it("is offered for a colour that was chosen", () => {
    section({ ...defaultTheme, manual: ["colors.focusRing"] })

    // A mark nobody can remove is a one-way door: set the ring once and the
    // brand colour could never move it again.
    expect(screen.getByRole("button", { name: "Use derived" })).toBeInTheDocument()
  })

  it("clears the mark and writes what the brand colour implies", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "#2563eb", focusRing: "#ff0000" },
      manual: ["colors.focusRing"],
    })

    await userEvent.click(screen.getByRole("button", { name: "Use derived" }))

    const next = written(update)

    // Both halves. Clearing the mark alone would leave the hand-set colour in
    // place until the next time somebody happened to pick a brand colour.
    expect(next.manual).toEqual([])
    expect(next.colors.focusRing).toBe("#2563eb66")
  })

  it("clears only the mark it was asked about", async () => {
    const update = section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "#2563eb" },
      manual: ["colors.border", "colors.focusRing"],
    })

    await userEvent.click(screen.getByRole("button", { name: "Use derived" }))

    expect(written(update).manual).toEqual(["colors.border"])
  })

  it("is not offered when the brand colour cannot be derived from", () => {
    /*
     * `deriveRoles` parses a hex or throws. Offering a way back to a value
     * that cannot be worked out would be a button that either does nothing or
     * takes the panel down.
     */
    section({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "rebeccapurple" },
      manual: ["colors.focusRing"],
    })

    expect(screen.queryByRole("button", { name: "Use derived" })).toBeNull()
    expect(screen.getByText("Set by hand")).toBeInTheDocument()
  })
})
