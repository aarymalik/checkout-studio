import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AppError } from "@checkout-studio/utils"
import { Button } from "../primitives/Button"
import { ErrorState } from "./ErrorState"
import { expectNoViolations } from "../../tests/axe"

function anError(overrides: Partial<ConstructorParameters<typeof AppError>[0]> = {}): AppError {
  return new AppError({
    code: "PAGE_LOAD_FAILED",
    domain: "internal",
    severity: "error",
    recoverability: "retryable",
    message: 'SELECT failed on relation "Page": connection reset',
    userMessage: "We could not load this page.",
    remediation: { label: "Try again", action: "retry" },
    ...overrides,
  })
}

describe("ErrorState", () => {
  it("shows the message written for the reader", () => {
    render(<ErrorState error={anError()} />)

    expect(screen.getByText("We could not load this page.")).toBeInTheDocument()
  })

  it("never shows the message written for engineers", () => {
    // The technical message names a table and a driver failure. Showing it
    // leaks the shape of the database to whoever is looking at the screen.
    render(<ErrorState error={anError()} />)

    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
    expect(screen.queryByText(/SELECT/)).not.toBeInTheDocument()
  })

  it("announces itself, because it replaces content the reader was waiting for", () => {
    render(<ErrorState error={anError()} />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  describe("retrying", () => {
    it("offers a retry when the error says one could help", async () => {
      const onRetry = vi.fn()
      render(<ErrorState error={anError()} onRetry={onRetry} />)

      await userEvent.click(screen.getByRole("button", { name: "Try again" }))

      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it("uses the label the error itself chose", () => {
      render(
        <ErrorState
          error={anError({ remediation: { label: "Reload the editor", action: "reload" } })}
          onRetry={vi.fn()}
        />,
      )

      expect(screen.getByRole("button", { name: "Reload the editor" })).toBeInTheDocument()
    })

    it("offers none on a fatal error, which would only fail twice", () => {
      render(<ErrorState error={anError({ recoverability: "fatal" })} onRetry={vi.fn()} />)

      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("offers none when the caller has nothing to retry with", () => {
      render(<ErrorState error={anError()} />)

      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })
  })

  it("names what is wrong per field when the error has details", () => {
    render(
      <ErrorState
        error={anError({
          details: [
            { path: "email", code: "invalid", message: "Enter a valid email address." },
            { path: "name", code: "required", message: "Name is required." },
          ],
        })}
      />,
    )

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument()
    expect(screen.getByText("Name is required.")).toBeInTheDocument()
  })

  it("takes an action beyond retrying", () => {
    render(<ErrorState error={anError()} action={<Button>Go back</Button>} />)

    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <ErrorState error={anError()} onRetry={vi.fn()} action={<Button>Go back</Button>} />,
    )

    await expectNoViolations(container)
  })
})
