import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Textarea } from "./Textarea"
import { expectNoViolations } from "../../tests/axe"

describe("Textarea", () => {
  it("is labelled, and the label is associated with the control", () => {
    render(<Textarea label="Description" />)

    expect(screen.getByLabelText("Description")).toBe(screen.getByRole("textbox"))
  })

  it("shows four rows unless told otherwise", () => {
    render(<Textarea label="Notes" />)

    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "4")
  })

  it("accepts a row count", () => {
    render(<Textarea label="Notes" rows={8} />)

    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "8")
  })

  it("resizes vertically only, so it cannot break the column it sits in", () => {
    render(<Textarea label="Notes" />)

    expect(screen.getByRole("textbox").className).toContain("resize-y")
  })

  it("announces its description and its error together", () => {
    render(<Textarea label="Notes" description="Markdown is supported" error="Too long" />)

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Markdown is supported Too long",
    )
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Too long")
  })

  it("keeps what the reader types", async () => {
    render(<Textarea label="Notes" />)

    await userEvent.type(screen.getByRole("textbox"), "Two lines")

    expect(screen.getByRole("textbox")).toHaveValue("Two lines")
  })

  it("works controlled", async () => {
    function Limited() {
      const [value, setValue] = useState("")
      return (
        <Textarea
          label="Notes"
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, 3))}
        />
      )
    }

    render(<Limited />)
    await userEvent.type(screen.getByRole("textbox"), "abcdef")

    expect(screen.getByRole("textbox")).toHaveValue("abc")
  })

  it("reports changes to its handler", async () => {
    const onChange = vi.fn()
    render(<Textarea label="Notes" onChange={onChange} />)

    await userEvent.type(screen.getByRole("textbox"), "ab")

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("cannot be typed into when disabled", async () => {
    render(<Textarea label="Notes" disabled />)

    await userEvent.type(screen.getByRole("textbox"), "hello")

    expect(screen.getByRole("textbox")).toHaveValue("")
  })

  it("forwards its ref", () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea label="Notes" ref={ref} />)

    expect(ref.current).toBe(screen.getByRole("textbox"))
  })

  it("lets the caller's className win a conflict", () => {
    render(<Textarea label="Notes" className="rounded-card" />)

    const classes = screen.getByRole("textbox").className.split(" ")
    expect(classes).toContain("rounded-card")
    expect(classes).not.toContain("rounded-control")
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Textarea label="Notes" description="Markdown is supported" required />,
    )

    await expectNoViolations(container)
  })
})
