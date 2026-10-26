import { TYPE_RATIOS, deriveTypeScale } from "@checkout-studio/design-system"
import { SYSTEM_FAMILIES, TYPE_SCALE_STEPS, defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Typography } from "./Typography"

/**
 * The Typography section.
 *
 * What these protect: the base size reaches every step, the steps keep the
 * decisions a ladder cannot make for them, and a font that cannot be loaded is
 * never offered as though it could be.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(<Typography theme={theme} update={update} />)

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

const typography = (over: Partial<CheckoutTheme["typography"]>): CheckoutTheme => ({
  ...defaultTheme,
  typography: { ...defaultTheme.typography, ...over },
})

async function nudge(name: string): Promise<void> {
  const slider = screen.getByRole("slider", { name })

  slider.focus()
  await userEvent.keyboard("{ArrowRight}")
}

describe("the ladder", () => {
  it("is the default theme's own sizes at its own body size", () => {
    /*
     * The measurement the section is built on, pinned where both halves are
     * reachable: the design system and the schema are on the same layer and
     * cannot import each other.
     */
    const sizes = deriveTypeScale(16)

    for (const step of TYPE_SCALE_STEPS) {
      expect(`${String(sizes[step])}px`).toBe(defaultTheme.typography.scale[step].fontSize)
    }
  })

  it("names every step the schema does, and no others", () => {
    // A tenth step in one and not the other would derive nothing for it and
    // leave it at whatever it already was, silently.
    expect(Object.keys(TYPE_RATIOS).sort()).toEqual([...TYPE_SCALE_STEPS].sort())
  })
})

describe("the body size", () => {
  it("resizes every step", async () => {
    const update = section()

    await nudge("Body size")

    const scale = written(update).typography.scale
    const expected = deriveTypeScale(17)

    for (const step of TYPE_SCALE_STEPS) {
      expect(scale[step].fontSize).toBe(`${String(expected[step])}px`)
    }
  })

  it("keeps what the ladder has nothing to say about", async () => {
    /*
     * Leading, tracking and weight are per-step decisions. The default
     * theme's display line is deliberately tighter than its caption, and a
     * resize that flattened them would throw that away.
     */
    const update = section()

    await nudge("Body size")

    const scale = written(update).typography.scale

    for (const step of TYPE_SCALE_STEPS) {
      const before = defaultTheme.typography.scale[step]

      expect(scale[step].lineHeight).toBe(before.lineHeight)
      expect(scale[step].letterSpacing).toBe(before.letterSpacing)
      expect(scale[step].fontWeight).toBe(before.fontWeight)
    }
  })

  it("keeps a text transform a step was given", async () => {
    const shouting = typography({
      scale: {
        ...defaultTheme.typography.scale,
        caption: { ...defaultTheme.typography.scale.caption, textTransform: "uppercase" },
      },
    })

    const update = section(shouting)

    await nudge("Body size")

    expect(written(update).typography.scale.caption.textTransform).toBe("uppercase")
  })

  it("is read off body, so the slider starts where the theme is", () => {
    section()

    expect(screen.getByRole("slider", { name: "Body size" })).toHaveAttribute("aria-valuenow", "16")
  })
})

describe("a body size the ladder cannot be worked out from", () => {
  it("says so rather than deriving from NaN", () => {
    const relative = typography({
      scale: {
        ...defaultTheme.typography.scale,
        body: { ...defaultTheme.typography.scale.body, fontSize: "1rem" },
      },
    })

    section(relative)

    expect(screen.queryByRole("slider", { name: "Body size" })).toBeNull()
    expect(screen.getByText(/derived from a size in pixels/)).toBeVisible()
  })

  it("shows one past the ends of the slider as written rather than pinning it", () => {
    /*
     * A 48px body is valid and nothing this slider can show. Pinning it to the
     * maximum would report a size three times smaller than the one the theme
     * holds, on a screen opened to look at it.
     */
    const huge = typography({
      scale: {
        ...defaultTheme.typography.scale,
        body: { ...defaultTheme.typography.scale.body, fontSize: "48px" },
      },
    })

    section(huge)

    expect(screen.queryByRole("slider", { name: "Body size" })).toBeNull()
    expect(screen.getByText("48px")).toBeVisible()
  })
})

describe("the fonts", () => {
  it("offers only families that need no file fetched for them", () => {
    section()

    // Three slots, each a select over the same list.
    expect(screen.getAllByRole("combobox")).toHaveLength(3)
    expect(
      screen.getByText(/Google and uploaded fonts arrive with the asset pipeline/),
    ).toBeVisible()
  })

  it("writes the stack along with the family", async () => {
    /*
     * A serif family left on a sans fallback renders as a sans on exactly the
     * machines the fallback exists for.
     */
    const update = section()

    await userEvent.click(screen.getByRole("combobox", { name: "Body" }))
    await userEvent.click(screen.getByRole("option", { name: "Georgia" }))

    const font = written(update).typography.fontFamily.body
    const georgia = SYSTEM_FAMILIES.find((option) => option.family === "Georgia")

    expect(font.family).toBe("Georgia")
    expect(font.fallback).toEqual(georgia?.fallback)
  })

  it("keeps the weights, which are what the theme offers rather than what it loads", async () => {
    const update = section()

    await userEvent.click(screen.getByRole("combobox", { name: "Headings" }))
    await userEvent.click(screen.getByRole("option", { name: "Georgia" }))

    expect(written(update).typography.fontFamily.heading.weights).toEqual(
      defaultTheme.typography.fontFamily.heading.weights,
    )
  })

  it("changes one slot and leaves the others", async () => {
    const update = section()

    await userEvent.click(screen.getByRole("combobox", { name: "Body" }))
    await userEvent.click(screen.getByRole("option", { name: "Georgia" }))

    const families = written(update).typography.fontFamily

    expect(families.heading).toEqual(defaultTheme.typography.fontFamily.heading)
    expect(families.mono).toEqual(defaultTheme.typography.fontFamily.mono)
  })
})

describe("a font this section did not offer", () => {
  it("shows a family it does not know as written", () => {
    const custom = typography({
      fontFamily: {
        ...defaultTheme.typography.fontFamily,
        heading: { ...defaultTheme.typography.fontFamily.heading, family: "Söhne" },
      },
    })

    section(custom)

    expect(screen.getByText("Söhne")).toBeVisible()
    expect(screen.getAllByRole("combobox")).toHaveLength(2)
  })

  it("names the pipeline a Google family is waiting on", () => {
    // Chosen elsewhere, or by an import. The panel will not offer it, and it
    // will not pretend the theme does not hold it either.
    const google = typography({
      fontFamily: {
        ...defaultTheme.typography.fontFamily,
        heading: {
          ...defaultTheme.typography.fontFamily.heading,
          family: "Playfair Display",
          source: "google",
        },
      },
    })

    section(google)

    expect(screen.getByText(/A google font, which needs the asset pipeline/)).toBeVisible()
  })
})

describe("the fluid scale", () => {
  it("changes one breakpoint and leaves the others", async () => {
    const update = section()

    await nudge("Mobile")

    const fluid = written(update).typography.fluidScale

    expect(fluid.mobile).toBeGreaterThan(defaultTheme.typography.fluidScale.mobile ?? 1)
    expect(fluid.desktop).toBe(defaultTheme.typography.fluidScale.desktop)
    expect(fluid.tablet).toBe(defaultTheme.typography.fluidScale.tablet)
  })

  it("leaves the scale alone, because it multiplies it at render time", async () => {
    const update = section()

    await nudge("Desktop")

    expect(written(update).typography.scale).toEqual(defaultTheme.typography.scale)
  })
})
