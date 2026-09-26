import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Skeleton } from "./Skeleton"
import { expectNoViolations } from "../../tests/axe"

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    // Its shape is a hint about layout. Announced, it is a row of empty boxes
    // described one at a time.
    const { container } = render(<Skeleton className="h-4 w-32" />)

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })

  it("takes its size from the caller, because only they know the shape", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />)

    expect((container.firstElementChild as HTMLElement).className).toContain("h-4")
  })

  it("pulses with a token, and stops when a reader asks for less motion", () => {
    // Unlike the Spinner, the pulse is decorative: it carries no
    // essential-motion marker, so the blanket reduced-motion rule stops it.
    const { container } = render(<Skeleton />)
    const element = container.firstElementChild as HTMLElement

    expect(element.className).toContain("animate-skeleton")
    expect(element).not.toHaveAttribute("data-essential-motion")
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <div aria-busy="true">
        <Skeleton className="h-4 w-32" />
      </div>,
    )

    await expectNoViolations(container)
  })
})
