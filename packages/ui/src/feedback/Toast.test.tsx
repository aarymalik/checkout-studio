import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import { ToastProvider, useToast } from "./Toast"
import { expectNoViolations } from "../../tests/axe"

function Surface({ onAction = vi.fn() } = {}) {
  function Raise() {
    const { show } = useToast()

    return (
      <>
        <Button onClick={() => show({ title: "Page published" })}>Publish</Button>
        <Button
          onClick={() =>
            show({
              title: "Publish failed",
              description: "The connection dropped.",
              variant: "danger",
              action: { label: "Retry", onAction },
            })
          }
        >
          Fail
        </Button>
      </>
    )
  }

  return (
    <ToastProvider>
      <Raise />
    </ToastProvider>
  )
}

describe("Toast", () => {
  it("shows nothing until something is raised", () => {
    render(<Surface />)

    expect(screen.queryByText("Page published")).not.toBeInTheDocument()
  })

  it("shows a toast that was raised", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Publish" }))

    expect(screen.getByText("Page published")).toBeInTheDocument()
  })

  it("shows its description", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Fail" }))

    expect(screen.getByText("The connection dropped.")).toBeInTheDocument()
  })

  /**
   * Radix announces through a hidden live region rather than through a role on
   * the toast itself, so the politeness is in `aria-live` — which is the
   * attribute that actually decides whether a screen reader is interrupted.
   */
  function announcement(): HTMLElement | null {
    return document.querySelector('[role="status"][aria-live]')
  }

  it("interrupts for a failure", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Fail" }))

    expect(announcement()).toHaveAttribute("aria-live", "assertive")
  })

  it("waits its turn for a confirmation", async () => {
    // A success that cuts across what a screen reader is already saying is
    // worse than one that arrives a moment later.
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Publish" }))

    expect(announcement()).toHaveAttribute("aria-live", "polite")
  })

  it("stacks several at once", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(screen.getByRole("button", { name: "Fail" }))

    expect(screen.getByText("Page published")).toBeInTheDocument()
    expect(screen.getByText("Publish failed")).toBeInTheDocument()
  })

  it("runs its one action", async () => {
    const onAction = vi.fn()
    render(<Surface onAction={onAction} />)

    await userEvent.click(screen.getByRole("button", { name: "Fail" }))
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it("is dismissed from its close button", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }))

    await waitFor(() => expect(screen.queryByText("Page published")).not.toBeInTheDocument())
  })

  it("refuses to be used outside a provider, rather than doing nothing", () => {
    function Orphan() {
      useToast()
      return null
    }

    // A toast that silently fails to appear is a bug nobody can find.
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/)
  })

  it("reports no axe violations", async () => {
    render(<Surface />)

    await userEvent.click(screen.getByRole("button", { name: "Fail" }))

    await expectNoViolations(document.body)
  })
})
