import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "./Button"
import { expectNoViolations } from "../../tests/axe"

const VARIANTS = ["primary", "secondary", "ghost", "outline", "danger"] as const
const SIZES = ["sm", "md", "lg"] as const

describe("Button", () => {
  it("renders a button with its label as the accessible name", () => {
    render(<Button>Publish</Button>)

    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument()
  })

  it("is a primary, medium button unless told otherwise", () => {
    render(<Button>Save</Button>)

    const element = screen.getByRole("button")
    expect(element.className).toContain("bg-primary")
    expect(element.className).toContain("h-control-md")
  })

  it.each(VARIANTS)("renders the %s variant", (variant) => {
    render(<Button variant={variant}>Action</Button>)

    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("gives each variant a different appearance", () => {
    // Five variants that rendered identically would pass the test above while
    // telling the reader nothing about how much the action matters.
    const classNames = VARIANTS.map((variant) => {
      const { unmount } = render(<Button variant={variant}>Action</Button>)
      const className = screen.getByRole("button").className
      unmount()
      return className
    })

    expect(new Set(classNames).size).toBe(VARIANTS.length)
  })

  it.each(SIZES)("renders the %s size at its control height", (size) => {
    render(<Button size={size}>Action</Button>)

    expect(screen.getByRole("button").className).toContain(`h-control-${size}`)
  })

  it("carries no value of its own: every class is a token", () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    )

    // A hex colour, a pixel value or a millisecond duration in here would
    // survive every mode switch and every rebrand. pnpm tokens:check enforces
    // this across the repository; this keeps the guarantee next to the
    // component it matters for.
    expect(screen.getByRole("button").className).not.toMatch(/#[0-9a-f]{3}|\d+px|\d+ms/i)
  })

  describe("when disabled", () => {
    it("says so, rather than only looking unavailable", () => {
      render(<Button disabled>Save</Button>)

      expect(screen.getByRole("button")).toBeDisabled()
    })

    it("does not fire its handler", async () => {
      const onClick = vi.fn()
      render(
        <Button disabled onClick={onClick}>
          Save
        </Button>,
      )

      await userEvent.click(screen.getByRole("button"))

      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe("when loading", () => {
    it("announces that work is happening", () => {
      render(<Button loading>Save</Button>)

      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true")
      expect(screen.getByRole("status")).toHaveTextContent("Working")
    })

    it("keeps its label, so the reader still knows what is happening", () => {
      render(<Button loading>Publishing changes</Button>)

      expect(screen.getByRole("button")).toHaveAccessibleName(/Publishing changes/)
    })

    it("cannot be pressed twice", async () => {
      const onClick = vi.fn()
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      )

      await userEvent.click(screen.getByRole("button"))

      expect(screen.getByRole("button")).toBeDisabled()
      expect(onClick).not.toHaveBeenCalled()
    })

    it("does not claim to be busy when it is not", () => {
      render(<Button>Save</Button>)

      expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy")
    })
  })

  it("calls its handler with the event", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    await userEvent.click(screen.getByRole("button"))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({ type: "click" })
  })

  it("forwards its ref to the button element", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Save</Button>)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    expect(ref.current).toBe(screen.getByRole("button"))
  })

  it("lets the caller's className win a conflict", () => {
    render(<Button className="bg-danger">Delete</Button>)

    // Asserted on the class list rather than the string: "bg-primary" is a
    // substring of "hover:bg-primary-hover", which would fail a contains check
    // for a class that is correctly gone.
    const classes = screen.getByRole("button").className.split(" ")
    expect(classes).toContain("bg-danger")
    expect(classes).not.toContain("bg-primary")
  })

  describe("asChild", () => {
    it("renders a link as a link, so it behaves like one", () => {
      // A link styled as a button must stay a link: otherwise it will not open
      // in a new tab and will not appear in a screen reader's list of links.
      render(
        <Button asChild>
          <a href="/pages">All pages</a>
        </Button>,
      )

      const link = screen.getByRole("link", { name: "All pages" })
      expect(link).toHaveAttribute("href", "/pages")
      expect(link.className).toContain("rounded-control")
      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("cannot also be loading, because Slot renders exactly one child", () => {
      // Radix's Slot calls React.Children.only, and a loading button renders a
      // spinner beside its label. The types rule the combination out, so it
      // cannot become a crash in the state nobody clicks through. Not rendered:
      // the assertion is that this does not compile.
      const invalid = (
        // @ts-expect-error -- loading is never when asChild is true
        <Button asChild loading>
          <a href="/pages">All pages</a>
        </Button>
      )

      expect(invalid).toBeTruthy()
    })
  })

  describe("keyboard", () => {
    it("is reachable by Tab", async () => {
      render(<Button>Save</Button>)

      await userEvent.tab()

      expect(screen.getByRole("button")).toHaveFocus()
    })

    it("is skipped by Tab when disabled", async () => {
      render(
        <>
          <Button disabled>Save</Button>
          <Button>Cancel</Button>
        </>,
      )

      await userEvent.tab()

      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
    })

    it.each(["{Enter}", " "])("activates with %s", async (key) => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Save</Button>)

      await userEvent.tab()
      await userEvent.keyboard(key)

      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  describe("accessibility", () => {
    it.each(VARIANTS)("reports no axe violations as a %s button", async (variant) => {
      const { container } = render(<Button variant={variant}>Action</Button>)

      await expectNoViolations(container)
    })

    it("reports no axe violations while loading", async () => {
      const { container } = render(<Button loading>Save</Button>)

      await expectNoViolations(container)
    })

    it("reports no axe violations when disabled", async () => {
      const { container } = render(<Button disabled>Save</Button>)

      await expectNoViolations(container)
    })
  })
})
