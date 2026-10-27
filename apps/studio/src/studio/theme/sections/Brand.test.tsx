import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Brand } from "./Brand"

/**
 * The Brand section, and what it is allowed to overwrite.
 *
 * docs/theme-system.md § Color Derivation: "overrides are marked as manual and
 * are never recomputed." These are the tests for the second half of that
 * sentence. Choosing a brand colour is the one action in the panel that writes
 * values a person did not type, so it is the one that has to know which values
 * were typed.
 */

/** Not a hex, so the seed is a text field and typing one derives. */
const TYPED: CheckoutTheme = {
  ...defaultTheme,
  colors: { ...defaultTheme.colors, primary: "rebeccapurple" },
}

function section(theme: CheckoutTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(
    <TooltipProvider>
      <Brand theme={theme} update={update} />
    </TooltipProvider>,
  )

  return update
}

async function choose(hex: string): Promise<void> {
  const field = screen.getByLabelText("Primary colour")

  await userEvent.clear(field)
  await userEvent.type(field, hex)
  await userEvent.tab()
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

/** `deriveRoles("#2563eb")`: the seed opaque, and white over it. */
const DERIVED_RING = "#2563eb"
const DERIVED_LABEL = "#ffffff"

describe("choosing a brand colour", () => {
  it("works out the roles nobody chose", async () => {
    const update = section(TYPED)

    await choose("#2563eb")

    const next = written(update)

    expect(next.colors.focusRing).toBe(DERIVED_RING)
    expect(next.colors.primaryForeground).toBe(DERIVED_LABEL)
  })

  it("leaves a role that was chosen by hand", async () => {
    const update = section({
      ...TYPED,
      colors: { ...TYPED.colors, focusRing: "#ff0000" },
      manual: ["colors.focusRing"],
    })

    await choose("#2563eb")

    const next = written(update)

    // The whole point: a brand colour may be picked twice without undoing a
    // decision somebody made in between.
    expect(next.colors.focusRing).toBe("#ff0000")
    expect(next.colors.primaryForeground).toBe(DERIVED_LABEL)
  })

  it("leaves both when both were chosen", async () => {
    const update = section({
      ...TYPED,
      colors: { ...TYPED.colors, focusRing: "#ff0000", primaryForeground: "#00ff00" },
      manual: ["colors.focusRing", "colors.primaryForeground"],
    })

    await choose("#2563eb")

    const next = written(update)

    expect(next.colors.focusRing).toBe("#ff0000")
    expect(next.colors.primaryForeground).toBe("#00ff00")
  })

  it("still writes the brand colour itself when every role was chosen", async () => {
    const update = section({
      ...TYPED,
      manual: ["colors.focusRing", "colors.primaryForeground"],
    })

    await choose("#2563eb")

    expect(written(update).colors.primary).toBe("#2563eb")
  })

  it("keeps the marks it was given", async () => {
    const update = section({ ...TYPED, manual: ["colors.focusRing"] })

    await choose("#2563eb")

    // Deriving is not a decision, so it neither adds a mark nor drops one.
    expect(written(update).manual).toEqual(["colors.focusRing"])
  })
})

describe("what the derived list admits", () => {
  it("marks a role the theme has been told not to follow", () => {
    section({ ...defaultTheme, manual: ["colors.focusRing"] })

    expect(screen.getByText("· set by hand")).toBeVisible()
  })

  it("says nothing of the sort when every role is still derived", () => {
    section(defaultTheme)

    expect(screen.queryByText("· set by hand")).toBeNull()
  })

  it("still shows what the brand colour implies for a chosen role", () => {
    // The implication is real; the theme has simply been told not to follow it.
    // Hiding the row would make the brand colour look like it had no opinion.
    section({ ...defaultTheme, manual: ["colors.focusRing"] })

    expect(screen.getByText("Focus ring")).toBeVisible()
  })
})

describe("a brand colour too pale to outline a focused field", () => {
  /** Amber: 2.15:1 on white, which no ring derived from it can improve on. */
  const PALE: CheckoutTheme = {
    ...defaultTheme,
    colors: { ...defaultTheme.colors, primary: "#f59e0b" },
  }

  it("says so", () => {
    section(PALE)

    expect(screen.getByRole("status")).toHaveTextContent(/too pale to outline a focused field/)
  })

  it("names the threshold it misses", () => {
    section(PALE)

    // WCAG 1.4.11. The number comes from the design system rather than being
    // written into the sentence twice.
    expect(screen.getByRole("status")).toHaveTextContent("3:1")
  })

  it("is a different problem from an unreadable label", () => {
    // Near-black reads on amber at better than 4.5:1, so the label is fine
    // and only the ring is not. Two checks, two sentences.
    section(PALE)

    expect(screen.queryByText(/Neither white nor near-black/)).toBeNull()
  })

  it("says nothing for a colour that clears the threshold", () => {
    section(defaultTheme)

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says nothing when the background cannot be measured", () => {
    /*
     * A background written as `oklch(...)` or as a reference to another token
     * is valid and unmeasurable. An unmeasurable pair is not a failing one, so
     * nothing is claimed rather than a warning shown on a guess.
     */
    section({
      ...PALE,
      colors: { ...PALE.colors, background: "oklch(0.2 0 0)" },
    })

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says nothing when the brand colour itself cannot be measured", () => {
    // Nothing is derived from it, so there is no derived ring to judge.
    section({ ...defaultTheme, colors: { ...defaultTheme.colors, primary: "rebeccapurple" } })

    expect(screen.queryByRole("status")).toBeNull()
  })
})
