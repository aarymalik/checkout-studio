import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DarkMode } from "./DarkMode"

/**
 * The Dark Mode section.
 *
 * What these protect is the sparseness. A dark layer that grows a key for
 * every colour has stopped being an override layer, and the specification is
 * explicit that one the size of a full theme means the semantic layer is
 * wrong. So: absent means inherited, overriding writes one key, and inheriting
 * removes it rather than writing the light value back.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(
    <TooltipProvider>
      <DarkMode theme={theme} update={update} />
    </TooltipProvider>,
  )

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

/** The default theme's dark layer overrides seven colours. */
const OVERRIDDEN = 7

describe("what the layer holds", () => {
  it("offers to override a colour it does not", () => {
    section()

    // Thirteen semantic colours, seven of them already overridden.
    expect(screen.getAllByRole("button", { name: "Override" })).toHaveLength(13 - OVERRIDDEN)
  })

  it("offers to inherit one it does", () => {
    section()

    expect(screen.getAllByRole("button", { name: "Inherit" })).toHaveLength(OVERRIDDEN)
  })

  it("shows the light value beside an override, so the pair can be judged", () => {
    section()

    // Muted text rather than the background: three of the light colours are
    // #ffffff, so that one is not a unique string to look for.
    expect(screen.getByText(`light ${defaultTheme.colors.foregroundMuted}`)).toBeVisible()
  })

  it("names the other groups the layer overrides rather than hiding them", () => {
    /*
     * The default theme's dark layer lowers its shadows too, because a shadow
     * is nearly invisible on a dark surface. This section does not edit them,
     * and a section that said nothing would leave a merchant unable to tell
     * their dark shadows differ at all.
     */
    section()

    expect(screen.getByText(/also overrides shadows in dark mode/)).toBeVisible()
  })
})

describe("overriding a colour", () => {
  it("seeds it from the light value it was showing", async () => {
    const update = section()

    // `success` is not in the default dark layer.
    const rows = screen.getAllByRole("button", { name: "Override" })

    await userEvent.click(rows[0] as HTMLElement)

    const colors = written(update).dark?.colors

    expect(Object.keys(colors ?? {})).toHaveLength(OVERRIDDEN + 1)
  })

  it("leaves the light theme alone", async () => {
    const update = section()

    await userEvent.click(screen.getAllByRole("button", { name: "Override" })[0] as HTMLElement)

    expect(written(update).colors).toEqual(defaultTheme.colors)
  })

  it("leaves the layer's other groups alone", async () => {
    const update = section()

    await userEvent.click(screen.getAllByRole("button", { name: "Override" })[0] as HTMLElement)

    expect(written(update).dark?.shadows).toEqual(defaultTheme.dark?.shadows)
  })
})

describe("inheriting a colour again", () => {
  it("removes the override rather than writing the light value back", async () => {
    /*
     * Writing the light value in would leave the layer one key larger and
     * claiming a decision nobody made — and the next change to the light
     * colour would not reach dark mode, because something there now overrides
     * it.
     */
    const update = section()

    await userEvent.click(screen.getAllByRole("button", { name: "Inherit" })[0] as HTMLElement)

    expect(Object.keys(written(update).dark?.colors ?? {})).toHaveLength(OVERRIDDEN - 1)
  })

  it("drops the group when the last colour goes, rather than storing an empty one", async () => {
    const one: CheckoutTheme = {
      ...defaultTheme,
      dark: { colors: { surface: "#141414" } },
    }

    const update = section(one)

    await userEvent.click(screen.getByRole("button", { name: "Inherit" }))

    expect(written(update).dark).toBeUndefined()
  })

  it("keeps the layer when another group still holds something", async () => {
    const mixed: CheckoutTheme = {
      ...defaultTheme,
      dark: { colors: { surface: "#141414" }, shadows: { sm: "none" } },
    }

    const update = section(mixed)

    await userEvent.click(screen.getByRole("button", { name: "Inherit" }))

    const dark = written(update).dark

    expect(dark?.colors).toBeUndefined()
    expect(dark?.shadows).toEqual({ sm: "none" })
  })
})

describe("a theme with no dark layer", () => {
  it("offers every colour", () => {
    const { dark: _dropped, ...light } = defaultTheme

    section(light)

    expect(screen.getAllByRole("button", { name: "Override" })).toHaveLength(13)
    expect(screen.queryByRole("button", { name: "Inherit" })).toBeNull()
  })

  it("creates the layer on the first override", async () => {
    const { dark: _dropped, ...light } = defaultTheme

    const update = section(light)

    await userEvent.click(screen.getAllByRole("button", { name: "Override" })[0] as HTMLElement)

    expect(Object.keys(written(update).dark?.colors ?? {})).toHaveLength(1)
  })
})

describe("when it applies", () => {
  it("says where the choice lives when no page is open", () => {
    // The Theme panel exists with no page open, and the colour mode is a page
    // setting. A dead control would be worse than an explanation.
    section()

    expect(screen.getByText(/page setting rather than a theme value/)).toBeVisible()
  })
})
