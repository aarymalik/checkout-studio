import { deriveSpacing } from "@checkout-studio/design-system"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Spacing } from "./Spacing"

/**
 * The Spacing section.
 *
 * What these protect is that the base unit reaches the canvas. It does not do
 * that by itself — the renderer emits `--ck-space-N` from `spacing.scale` and
 * never reads `spacing.base` — so a base that did not rewrite the scale would
 * be a control that saved a number and moved nothing.
 */

function section(theme: CheckoutTheme = defaultTheme) {
  const update = vi.fn<(next: CheckoutTheme) => void>()

  render(<Spacing theme={theme} update={update} />)

  return update
}

/** The theme the last write carried. */
function written(update: ReturnType<typeof section>): CheckoutTheme {
  const theme = update.mock.lastCall?.[0]

  if (theme === undefined) throw new Error("nothing was written")

  return theme
}

async function nudge(name: string): Promise<void> {
  const slider = screen.getByRole("slider", { name })

  slider.focus()
  await userEvent.keyboard("{ArrowRight}")
}

describe("the ladder", () => {
  it("is the default theme's own scale at the default theme's own base", () => {
    /*
     * The measurement the section is built on, pinned where both halves are
     * reachable: the design system and the schema are on the same layer and
     * cannot import each other, so neither package can assert this.
     */
    expect(deriveSpacing(defaultTheme.spacing.base)).toEqual(defaultTheme.spacing.scale)
  })
})

describe("the base unit", () => {
  it("rewrites the scale, which is the part the renderer reads", async () => {
    const update = section()

    await nudge("Base unit")

    const theme = written(update)

    expect(theme.spacing.base).toBe(defaultTheme.spacing.base + 1)
    expect(theme.spacing.scale).toEqual(deriveSpacing(defaultTheme.spacing.base + 1))
  })

  it("leaves the scale no shorter than it was", async () => {
    // A step the renderer had emitted and no longer does is a gap that
    // silently collapses on every node referencing it.
    const update = section()

    await nudge("Base unit")

    expect(written(update).spacing.scale).toHaveLength(defaultTheme.spacing.scale.length)
  })

  it("shows the scale it produced", () => {
    section()

    expect(screen.getByText(/12 steps, 0px to 96px/)).toBeVisible()
  })
})

describe("density", () => {
  it("changes one breakpoint and leaves the others", async () => {
    const update = section()

    await nudge("Mobile")

    const density = written(update).spacing.density

    expect(density.mobile).toBeGreaterThan(defaultTheme.spacing.density.mobile ?? 1)
    expect(density.desktop).toBe(defaultTheme.spacing.density.desktop)
    expect(density.tablet).toBe(defaultTheme.spacing.density.tablet)
  })

  it("leaves the scale alone, because it multiplies it at render time", async () => {
    const update = section()

    await nudge("Desktop")

    expect(written(update).spacing.scale).toEqual(defaultTheme.spacing.scale)
  })
})
