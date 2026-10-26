import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { ProjectThemeProvider, useProjectTheme } from "./ProjectTheme"

/**
 * The theme while it is being edited.
 *
 * What these protect is that an edit is visible at once and written once, and
 * that a failed write is kept rather than dropped.
 */

function Harness({ save }: { save: (projectId: string, theme: CheckoutTheme) => Promise<void> }) {
  return (
    <ProjectThemeProvider projectId="prj_1" initial={defaultTheme} save={save} debounceMs={50}>
      <Reader />
    </ProjectThemeProvider>
  )
}

/*
 * Read exactly, not as a substring.
 *
 * `toHaveTextContent("saved")` matches "unsaved", so every assertion in this
 * file passed against the one state it was written to rule out. A mutation
 * that stopped the pending value ever being cleared — which leaves the status
 * stuck on "unsaved" for ever — broke nothing at all.
 */
function status(): string {
  return screen.getByTestId("status").textContent ?? ""
}

function Reader(): ReactElement {
  const project = useProjectTheme()

  if (project === null) return <p>nothing</p>

  return (
    <div>
      <p data-testid="name">{project.theme.name}</p>
      <p data-testid="status">{project.status}</p>
      <button
        type="button"
        onClick={() => {
          project.update({ ...project.theme, name: `${project.theme.name}!` })
        }}
      >
        Edit
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("editing", () => {
  it("shows the change at once, before anything is written", async () => {
    // The canvas reads this state, and docs/theme-system.md asks a theme
    // change to land in under sixteen milliseconds. A round trip would not.
    const save = vi.fn(async () => undefined)

    render(<Harness save={save} />)

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(screen.getByTestId("name")).toHaveTextContent("Default!")
    expect(save).not.toHaveBeenCalled()
    expect(status()).toBe("unsaved")
  })

  it("writes once the typing stops", async () => {
    const save = vi.fn(async () => undefined)

    render(<Harness save={save} />)

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(status()).toBe("saved")
  })

  it("writes the last value of a burst, not the first", async () => {
    /*
     * The fault this avoids: a timer that closed over the theme would carry
     * whichever value existed when it was scheduled, so the last change of a
     * burst would be the one left behind.
     */
    const seen: string[] = []
    const save = vi.fn(async (_id: string, theme: CheckoutTheme) => {
      seen.push(theme.name)
    })

    render(<Harness save={save} />)

    const edit = screen.getByRole("button", { name: "Edit" })

    // One `act` each, so the next click reads the theme the last one made —
    // three inside one act share a render and all compute from the same
    // stale value. `fireEvent` rather than `userEvent` because these timers
    // advance real time between events, which would end the burst.
    act(() => {
      fireEvent.click(edit)
    })
    act(() => {
      fireEvent.click(edit)
    })
    act(() => {
      fireEvent.click(edit)
    })

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(["Default!!!"])
  })

  it("keeps what it could not write, rather than dropping it", async () => {
    const save = vi
      .fn<(id: string, theme: CheckoutTheme) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined)

    render(<Harness save={save} />)

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(status()).toBe("error")

    // The next edit carries the failed one with it: the theme is whole on
    // every write, so the later value includes the earlier change.
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(status()).toBe("saved")
    expect(save).toHaveBeenCalledTimes(2)
  })

  it("does not claim to be saved over an edit made while it was writing", async () => {
    let release: (() => void) | undefined
    const save = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    render(<Harness save={save} />)

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(status()).toBe("saving")

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await act(async () => {
      release?.()
      await Promise.resolve()
    })

    expect(status()).toBe("unsaved")
  })
})

describe("outside a provider", () => {
  it("answers with nothing rather than throwing", () => {
    // A panel rendered without a project is a real state — the gallery does
    // it — and taking the studio down for it would be the wrong trade.
    render(<Reader />)

    expect(screen.getByText("nothing")).toBeVisible()
  })
})
