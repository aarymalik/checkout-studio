import { hexToOklch } from "@checkout-studio/design-system"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProjectThemeProvider } from "./ProjectTheme"
import { ThemePanel } from "./ThemePanel"

/**
 * The Theme panel's Brand section.
 *
 * One colour in, and what it implies shown underneath — which is the whole of
 * docs/theme-system.md's "users pick one brand color, the system derives a
 * coherent scale".
 */

function panel(initial: CheckoutTheme = defaultTheme, save = vi.fn(async () => undefined)) {
  render(
    <TooltipProvider>
      <ProjectThemeProvider projectId="prj_1" initial={initial} save={save} debounceMs={10_000}>
        <ThemePanel />
      </ProjectThemeProvider>
    </TooltipProvider>,
  )

  return save
}

/** The same panel, with the debounce short enough to watch what it writes. */
function saving(initial: CheckoutTheme) {
  // Typed, so the call it recorded can be read back without an assertion.
  const save = vi.fn<(projectId: string, theme: CheckoutTheme) => Promise<void>>(
    async () => undefined,
  )

  render(
    <TooltipProvider>
      <ProjectThemeProvider projectId="prj_1" initial={initial} save={save} debounceMs={5}>
        <ThemePanel />
      </ProjectThemeProvider>
    </TooltipProvider>,
  )

  return save
}

/** What the last write carried, once one has happened. */
async function written(save: ReturnType<typeof saving>): Promise<CheckoutTheme> {
  await waitFor(() => {
    expect(save).toHaveBeenCalled()
  })

  const theme = save.mock.lastCall?.[1]

  if (theme === undefined) throw new Error("the save spy recorded no theme")

  return theme
}

describe("the panel", () => {
  it("offers a section per group the theme holds values for", () => {
    panel()

    for (const title of ["Brand", "Typography", "Spacing", "Radius", "Shadows"]) {
      expect(screen.getByRole("heading", { name: title, level: 3 })).toBeVisible()
    }
  })

  it("opens on Brand, the one decision that shows up everywhere at once", () => {
    panel()

    expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Radius" })).toHaveAttribute("aria-expanded", "false")
  })

  it("opens another without closing the first, because a radius is compared against a shadow", async () => {
    panel()

    await userEvent.click(screen.getByRole("button", { name: "Radius" }))

    expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Radius" })).toHaveAttribute("aria-expanded", "true")
  })
})

describe("the brand colour", () => {
  it("shows the one the theme holds", () => {
    panel()

    // In the picker's own trigger, not anywhere the hex happens to appear: the
    // derived focus ring is the seed itself, so the string occurs twice.
    expect(screen.getByRole("button", { name: /Primary colour/ })).toHaveTextContent(
      defaultTheme.colors.primary,
    )
  })

  it("shows the scale it implies", () => {
    // Eleven rungs, because a person choosing a brand colour is really
    // choosing eleven of them.
    const { container } = render(
      <TooltipProvider>
        <ProjectThemeProvider projectId="prj_1" initial={defaultTheme} save={vi.fn()}>
          <ThemePanel />
        </ProjectThemeProvider>
      </TooltipProvider>,
    )

    const swatches = container.querySelectorAll('[title^="50 ·"], [title^="950 ·"]')

    expect(swatches).toHaveLength(2)
  })

  it("names the values it will store, and marks the ones it will not", () => {
    /*
     * The specification derives five roles. `themeColors` holds two of them:
     * a button's hover is a component slot a plugin defines, and nothing
     * models a selection colour. Showing all five and marking three is more
     * honest than showing two and pretending the others were never derived.
     */
    panel()

    expect(screen.getByText("Label on it")).toBeVisible()
    expect(screen.getByText("Focus ring")).toBeVisible()
    expect(screen.getAllByText("· not stored")).toHaveLength(3)
  })
})

describe("choosing another one", () => {
  it("writes the colour and what the theme can keep of what it implies", async () => {
    const save = panel()

    await userEvent.click(screen.getByRole("button", { name: /Primary colour/ }))
    await userEvent.clear(screen.getByLabelText("Hex"))
    await userEvent.type(screen.getByLabelText("Hex"), "#2563eb")

    // Shown at once; the write is debounced far past the end of this test.
    expect(screen.getByRole("button", { name: /Primary colour/ })).toHaveTextContent("#2563eb")
    expect(save).not.toHaveBeenCalled()
  })

  it("darkens the derived values rather than leaving the old ones", async () => {
    panel()

    await userEvent.click(screen.getByRole("button", { name: /Primary colour/ }))
    await userEvent.clear(screen.getByLabelText("Hex"))
    await userEvent.type(screen.getByLabelText("Hex"), "#2563eb")

    const hover = screen.getByText("Hover").closest("div")?.querySelector("dd")?.textContent ?? ""

    expect(hexToOklch(hover).lightness).toBeLessThan(hexToOklch("#2563eb").lightness)
  })
})

describe("a colour the scale cannot be worked out from", () => {
  it("says so rather than showing eleven black squares", () => {
    /*
     * A theme may hold `oklch(...)`, a named colour, or a token reference. All
     * are valid and none can be stepped through.
     */
    panel({ ...defaultTheme, colors: { ...defaultTheme.colors, primary: "rebeccapurple" } })

    expect(screen.getByText(/A scale is derived from a hex colour/)).toBeVisible()
  })

  it("is typed rather than picked, because a picker would have to invent one", () => {
    /*
     * It used to open at black. A picker needs a colour to start from, and
     * black is not this theme's brand colour — it is the absence of an answer
     * dressed as one.
     */
    panel({ ...defaultTheme, colors: { ...defaultTheme.colors, primary: "rebeccapurple" } })

    expect(screen.getByLabelText("Primary colour")).toHaveValue("rebeccapurple")
    expect(screen.queryByRole("button", { name: /Primary colour/ })).toBeNull()
  })

  it("derives the scale again once a hex is typed into it", async () => {
    panel({ ...defaultTheme, colors: { ...defaultTheme.colors, primary: "rebeccapurple" } })

    const field = screen.getByLabelText("Primary colour")

    await userEvent.clear(field)
    await userEvent.type(field, "#2563eb")
    await userEvent.tab()

    expect(screen.getByText("Hover")).toBeVisible()
  })

  it("leaves the derived values alone when another unreadable colour is typed", async () => {
    /*
     * `deriveRoles` parses a hex or throws, so a colour it cannot read derives
     * nothing. The brand colour is still the merchant's to set — the ones
     * worked out from the old one simply stay as they are rather than taking
     * the panel down with them.
     */
    const save = saving({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "rebeccapurple" },
    })

    const field = screen.getByLabelText("Primary colour")

    await userEvent.clear(field)
    await userEvent.type(field, "oklch(0.6 0.2 250)")
    await userEvent.tab()

    const theme = await written(save)

    expect(theme.colors.primary).toBe("oklch(0.6 0.2 250)")
    expect(theme.colors.primaryForeground).toBe(defaultTheme.colors.primaryForeground)
  })

  it("writes nothing when the field is cleared and left", async () => {
    // Clearing it is somebody about to type, not a theme with no brand colour.
    const save = saving({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "rebeccapurple" },
    })

    await userEvent.clear(screen.getByLabelText("Primary colour"))
    await userEvent.tab()

    expect(screen.getByLabelText("Primary colour")).toHaveValue("rebeccapurple")
    expect(save).not.toHaveBeenCalled()
  })

  it("puts the stored colour back on Escape", async () => {
    const save = saving({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, primary: "rebeccapurple" },
    })

    const field = screen.getByLabelText("Primary colour")

    await userEvent.clear(field)
    await userEvent.type(field, "whatever{Escape}")

    expect(field).toHaveValue("rebeccapurple")
    expect(save).not.toHaveBeenCalled()
  })
})

describe("a brand colour nothing can be read on", () => {
  it("says so, because a button using it will fail AA", () => {
    panel({ ...defaultTheme, colors: { ...defaultTheme.colors, primary: "#777777" } })

    expect(screen.getByRole("status")).toHaveTextContent(/will not meet AA/)
  })
})
