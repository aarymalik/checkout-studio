import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { registry } from "../../registry"
import { Components } from "./Components"

/**
 * The Components section.
 *
 * Nothing here names a component, and nor does the section. What these protect
 * is that the list comes from the registry and that a slot's values are
 * written where the renderer reads them.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(
    <TooltipProvider>
      <Components theme={theme} update={update} />
    </TooltipProvider>,
  )

  return update
}

function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

/** Every type the build's registry offers theme values for. */
function slotted(): readonly string[] {
  return registry.types().filter((type) => registry.themeSlot(type) !== undefined)
}

describe("the list", () => {
  it("comes from the registry", () => {
    /*
     * Asserted against the registry rather than against a name. A test naming
     * "core.container" would pass a refactor that moved the slot to a
     * different component and fail a plugin being added, which is the
     * opposite of what this section is for.
     */
    section()

    for (const type of slotted()) {
      const label = registry.themeSlot(type)?.label ?? ""

      expect(screen.getByText(label)).toBeVisible()
    }
  })

  it("is a proper subset of it, so a component with no slot is not drawn", () => {
    /*
     * Most components register no slot. If the section drew every registered
     * type it would still pass the test above — this is what rules that out,
     * without naming a component either way.
     */
    section()

    expect(slotted().length).toBeGreaterThan(0)
    expect(slotted().length).toBeLessThan(registry.types().length)
  })

  it("draws a field per declared value and no more", () => {
    section()

    const declared = slotted().reduce(
      (total, type) => total + (registry.themeSlot(type)?.fields?.length ?? 0),
      0,
    )

    expect(screen.getAllByRole("spinbutton")).toHaveLength(declared)
  })
})

describe("a value the theme has not set", () => {
  it("shows the plugin's own default, which is what the renderer resolves", () => {
    /*
     * The renderer spreads the theme's values over the plugin's defaults, so a
     * theme that sets nothing still renders at 1120px. A panel showing an
     * empty box beside a canvas that plainly has a measure is the bug this
     * rules out — the inspector had exactly it.
     */
    const [type] = slotted()
    const slot = type === undefined ? undefined : registry.themeSlot(type)
    const field = slot?.fields?.[0]

    section({ ...defaultTheme, components: {} })

    expect(screen.getByRole("spinbutton")).toHaveValue(
      Number.parseFloat(String(slot?.defaults[field?.key ?? ""])),
    )
  })
})

describe("writing a value", () => {
  it("puts it under the component's own type, where the renderer reads it", async () => {
    const [type] = slotted()
    const field = type === undefined ? undefined : registry.themeSlot(type)?.fields?.[0]

    if (type === undefined || field === undefined) throw new Error("no slot to test")

    const update = section({ ...defaultTheme, components: {} })

    const box = screen.getByRole("spinbutton")

    await userEvent.clear(box)
    await userEvent.type(box, "960")

    expect(written(update).components[type]?.[field.key]).toBe("960px")
  })

  it("leaves the rest of the theme alone", async () => {
    const update = section({ ...defaultTheme, components: {} })

    const box = screen.getByRole("spinbutton")

    await userEvent.clear(box)
    await userEvent.type(box, "960")

    const theme = written(update)

    expect(theme.colors).toEqual(defaultTheme.colors)
    expect(theme.spacing).toEqual(defaultTheme.spacing)
  })
})

describe("putting a value back", () => {
  it("removes it rather than writing the default in", async () => {
    /*
     * Writing today's default into the theme would freeze it there and leave a
     * later one unreachable: the plugin would ship 1200px and every project
     * that had ever touched the field would stay at 1120.
     */
    const [type] = slotted()
    const field = type === undefined ? undefined : registry.themeSlot(type)?.fields?.[0]

    if (type === undefined || field === undefined) throw new Error("no slot to test")

    const update = section({ ...defaultTheme, components: { [type]: { [field.key]: "960px" } } })

    await userEvent.click(screen.getByRole("button", { name: /reset|back/i }))

    expect(written(update).components[type]).toEqual({})
  })

  it("is not offered when the theme has set nothing", () => {
    section({ ...defaultTheme, components: {} })

    expect(screen.queryByRole("button", { name: /reset|back/i })).toBeNull()
  })
})
