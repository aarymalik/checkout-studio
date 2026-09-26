import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Errors } from "@checkout-studio/utils"
import { logger } from "@checkout-studio/observability"
import {
  AppErrorBoundary,
  ErrorBoundary,
  PanelErrorBoundary,
  RouteErrorBoundary,
} from "./ErrorBoundary"
import { expectNoViolations } from "../../tests/axe"

function Explode({ throws = true }: { throws?: boolean }) {
  if (throws) throw new Error("Cannot read properties of undefined (reading 'width')")
  return <p>Working</p>
}

beforeEach(() => {
  // React logs every caught error to the console. That is React reporting, not
  // our code, and it would bury the actual test output.
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(logger, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ErrorBoundary", () => {
  it("renders its children while nothing is wrong", () => {
    render(
      <ErrorBoundary scope="panel">
        <Explode throws={false} />
      </ErrorBoundary>,
    )

    expect(screen.getByText("Working")).toBeInTheDocument()
  })

  it("catches a render error instead of taking the tree down", () => {
    render(
      <ErrorBoundary scope="panel">
        <Explode />
      </ErrorBoundary>,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("shows a message written for the reader, not the thrown one", () => {
    // "Cannot read properties of undefined" is a fact about our code. Nobody
    // looking at the screen can do anything with it.
    render(
      <ErrorBoundary scope="panel">
        <Explode />
      </ErrorBoundary>,
    )

    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).not.toHaveTextContent("undefined")
  })

  it("normalises whatever was thrown, including a string", () => {
    // A boundary that catches a string cannot tell whether a retry would help.
    function ThrowString(): never {
      throw "went wrong"
    }

    render(
      <ErrorBoundary scope="panel">
        <ThrowString />
      </ErrorBoundary>,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("logs where the failure happened, with the component stack", () => {
    render(
      <ErrorBoundary scope="panel" name="inspector">
        <Explode />
      </ErrorBoundary>,
    )

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [event, data] = vi.mocked(logger.error).mock.calls[0] ?? []
    expect(event).toBe("ui.render.failed")
    expect(data).toMatchObject({ scope: "panel", boundary: "inspector" })
    expect((data as { componentStack: string }).componentStack).toContain("Explode")
  })

  it("hands the error to its owner, for reporting or for resetting state", () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary scope="panel" onError={onError}>
        <Explode />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]?.code).toBeDefined()
  })

  it("recovers when the reader retries and the cause is gone", async () => {
    function Flaky() {
      const [fixed, setFixed] = useState(false)
      return (
        <>
          <button onClick={() => setFixed(true)}>Fix it</button>
          <ErrorBoundary scope="panel">
            <Explode throws={!fixed} />
          </ErrorBoundary>
        </>
      )
    }

    render(<Flaky />)

    await userEvent.click(screen.getByRole("button", { name: "Fix it" }))
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }))

    expect(screen.getByText("Working")).toBeInTheDocument()
  })

  it("takes a fallback of its own", () => {
    render(
      <ErrorBoundary scope="panel" fallback={(error) => <p>Custom: {error.code}</p>}>
        <Explode />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/Custom:/)).toBeInTheDocument()
  })

  it("gives a custom fallback a way to reset", async () => {
    function Flaky() {
      const [fixed, setFixed] = useState(false)
      return (
        <ErrorBoundary
          scope="panel"
          fallback={(_, reset) => (
            <button
              onClick={() => {
                setFixed(true)
                reset()
              }}
            >
              Reset
            </button>
          )}
        >
          <Explode throws={!fixed} />
        </ErrorBoundary>
      )
    }

    render(<Flaky />)
    await userEvent.click(screen.getByRole("button", { name: "Reset" }))

    expect(screen.getByText("Working")).toBeInTheDocument()
  })

  it("keeps a thrown AppError's own message, rather than replacing it", () => {
    function ThrowAppError(): never {
      throw Errors.validation.invalidInput([
        { path: "name", code: "required", message: "Name is required." },
      ])
    }

    render(
      <ErrorBoundary scope="panel">
        <ThrowAppError />
      </ErrorBoundary>,
    )

    expect(screen.getByText("Name is required.")).toBeInTheDocument()
  })

  describe("the three scopes", () => {
    it("offers a reload only at application level", () => {
      // Reloading because one panel failed throws away every unsaved change on
      // the page.
      const app = render(
        <AppErrorBoundary>
          <Explode />
        </AppErrorBoundary>,
      )
      expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
      app.unmount()

      render(
        <PanelErrorBoundary>
          <Explode />
        </PanelErrorBoundary>,
      )
      expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument()
    })

    it("names itself in the log when no name is given", () => {
      render(
        <RouteErrorBoundary>
          <Explode />
        </RouteErrorBoundary>,
      )

      expect(vi.mocked(logger.error).mock.calls[0]?.[1]).toMatchObject({
        scope: "route",
        boundary: "route",
      })
    })
  })

  it("reports no axe violations while showing a failure", async () => {
    const { container } = render(
      <RouteErrorBoundary>
        <Explode />
      </RouteErrorBoundary>,
    )

    await expectNoViolations(container)
  })
})
