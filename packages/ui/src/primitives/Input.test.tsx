import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Input } from "./Input"
import { expectNoViolations } from "../../tests/axe"

const SIZES = ["sm", "md", "lg"] as const

describe("Input", () => {
  it("is labelled, and the label is associated with the control", () => {
    render(<Input label="Page name" />)

    // getByLabelText only finds it if the association is real.
    expect(screen.getByLabelText("Page name")).toBe(screen.getByRole("textbox"))
  })

  it("keeps the label announced when it is visually hidden", () => {
    render(<Input label="Search" labelHidden />)

    expect(screen.getByRole("textbox")).toHaveAccessibleName("Search")
  })

  it("does not lean on the placeholder for its name", () => {
    // docs/ui-guidelines.md: never use a placeholder as a label. It disappears
    // as soon as someone types, which is when they most need it.
    render(<Input label="Email" placeholder="you@example.com" />)

    expect(screen.getByRole("textbox")).toHaveAccessibleName("Email")
  })

  it.each(SIZES)("renders the %s size at its control height", (size) => {
    render(<Input label="Name" size={size} />)

    expect(screen.getByRole("textbox").className).toContain(`h-control-${size}`)
  })

  it.each(["text", "email", "tel", "number", "password"] as const)(
    "renders as a %s input",
    (type) => {
      render(<Input label="Value" type={type} />)

      // A password field is not a textbox, so it is found by label either way.
      expect(screen.getByLabelText("Value")).toHaveAttribute("type", type)
    },
  )

  describe("description", () => {
    it("is announced as part of the control", () => {
      render(<Input label="Slug" description="Used in the page URL" />)

      expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Used in the page URL")
    })

    it("is absent when not given, rather than an empty element", () => {
      const { container } = render(<Input label="Slug" />)

      expect(container.querySelectorAll("p")).toHaveLength(0)
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby")
    })
  })

  describe("error", () => {
    it("says what is wrong in words, not only in colour", () => {
      render(<Input label="Email" error="Enter a valid email address" />)

      expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address")
    })

    it("marks the control invalid, so it is not only red", () => {
      render(<Input label="Email" error="Required" />)

      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true")
    })

    it("is announced as the control's description", () => {
      render(<Input label="Email" error="Required" />)

      expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Required")
    })

    it("is announced alongside the description when both are present", () => {
      render(<Input label="Email" description="Where receipts go" error="Required" />)

      expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Where receipts go Required")
    })

    it("is not claimed when the field is fine", () => {
      render(<Input label="Email" />)

      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid")
    })
  })

  describe("required", () => {
    it("tells assistive technology and shows a cue that is not a colour", () => {
      render(<Input label="Name" required />)

      expect(screen.getByRole("textbox")).toBeRequired()
      expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true")
    })
  })

  describe("disabled", () => {
    it("cannot be typed into", async () => {
      render(<Input label="Name" disabled />)

      await userEvent.type(screen.getByRole("textbox"), "hello")

      expect(screen.getByRole("textbox")).toBeDisabled()
      expect(screen.getByRole("textbox")).toHaveValue("")
    })
  })

  describe("value", () => {
    it("works uncontrolled, keeping what the reader types", async () => {
      render(<Input label="Name" defaultValue="Home" />)

      await userEvent.type(screen.getByRole("textbox"), " page")

      expect(screen.getByRole("textbox")).toHaveValue("Home page")
    })

    it("works controlled, showing only what the owner allows", async () => {
      function OnlyUppercase() {
        const [value, setValue] = useState("")
        return (
          <Input
            label="Code"
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase())}
          />
        )
      }

      render(<OnlyUppercase />)
      await userEvent.type(screen.getByRole("textbox"), "abc")

      expect(screen.getByRole("textbox")).toHaveValue("ABC")
    })

    it("reports each change to its handler", async () => {
      const onChange = vi.fn()
      render(<Input label="Name" onChange={onChange} />)

      await userEvent.type(screen.getByRole("textbox"), "ab")

      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange.mock.calls[1]?.[0]?.target?.value).toBe("ab")
    })
  })

  it("forwards its ref to the input element", () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input label="Name" ref={ref} />)

    expect(ref.current).toBe(screen.getByRole("textbox"))
  })

  it("lets the caller's className win a conflict", () => {
    render(<Input label="Name" className="rounded-pill" />)

    const classes = screen.getByRole("textbox").className.split(" ")
    expect(classes).toContain("rounded-pill")
    expect(classes).not.toContain("rounded-control")
  })

  it("takes an explicit id, for a form that manages its own", () => {
    render(<Input label="Name" id="page-name" description="Hint" />)

    expect(screen.getByRole("textbox")).toHaveAttribute("id", "page-name")
    expect(screen.getByText("Hint")).toHaveAttribute("id", "page-name-description")
  })

  it("gives two inputs on the same page different ids", () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>,
    )

    const [first, second] = screen.getAllByRole("textbox")
    expect(first?.id).not.toBe(second?.id)
  })

  it("is reachable by Tab", async () => {
    render(<Input label="Name" />)

    await userEvent.tab()

    expect(screen.getByRole("textbox")).toHaveFocus()
  })

  describe("accessibility", () => {
    it("reports no axe violations in its plain state", async () => {
      const { container } = render(<Input label="Name" />)

      await expectNoViolations(container)
    })

    it("reports no axe violations with a description and an error", async () => {
      const { container } = render(
        <Input label="Email" description="Where receipts go" error="Required" required />,
      )

      await expectNoViolations(container)
    })

    it("reports no axe violations when disabled", async () => {
      const { container } = render(<Input label="Name" disabled />)

      await expectNoViolations(container)
    })
  })
})
