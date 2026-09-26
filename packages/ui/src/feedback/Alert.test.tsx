import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Alert } from "./Alert"
import { expectNoViolations } from "../../tests/axe"

describe("Alert", () => {
  it("shows its title", () => {
    render(<Alert title="Saved" />)

    expect(screen.getByText("Saved")).toBeInTheDocument()
  })

  it("shows a body when given one", () => {
    render(<Alert title="Saved">Your changes are live.</Alert>)

    expect(screen.getByText("Your changes are live.")).toBeInTheDocument()
  })

  it.each([
    ["danger", "alert"],
    ["warning", "alert"],
    ["info", "status"],
    ["success", "status"],
  ] as const)("announces a %s alert as %s", (variant, role) => {
    // A failure usually follows something the reader just did, so it interrupts.
    // A success that cuts across what a screen reader was already saying is
    // worse than one that waits its turn.
    render(<Alert variant={variant} title="Message" />)

    expect(screen.getByRole(role)).toBeInTheDocument()
  })

  it("carries its meaning in an icon and words, not only in colour", () => {
    // Roughly one reader in twelve cannot use the colour, and nobody can use it
    // in a greyscale print.
    const { container } = render(<Alert variant="danger" title="Payment failed" />)

    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(screen.getByText("Payment failed")).toBeInTheDocument()
  })

  it("hides the icon from assistive technology, since the text says it", () => {
    const { container } = render(<Alert variant="danger" title="Payment failed" />)

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("gives each variant a different appearance", () => {
    const classNames = (["info", "success", "warning", "danger"] as const).map((variant) => {
      const { unmount, container } = render(<Alert variant={variant} title="Message" />)
      const className = (container.firstElementChild as HTMLElement).className
      unmount()
      return className
    })

    expect(new Set(classNames).size).toBe(4)
  })

  describe("dismissing", () => {
    it("offers no dismiss button unless it can be dismissed", () => {
      render(<Alert title="Saved" />)

      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("reports a dismissal", async () => {
      const onDismiss = vi.fn()
      render(<Alert title="Saved" onDismiss={onDismiss} />)

      await userEvent.click(screen.getByRole("button", { name: "Dismiss" }))

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it("can be dismissed from the keyboard", async () => {
      const onDismiss = vi.fn()
      render(<Alert title="Saved" onDismiss={onDismiss} />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Alert variant="danger" title="Payment failed" onDismiss={vi.fn()}>
        The card was declined.
      </Alert>,
    )

    await expectNoViolations(container)
  })
})
