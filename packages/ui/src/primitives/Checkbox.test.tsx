import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Checkbox } from "./Checkbox"
import { expectNoViolations } from "../../tests/axe"

describe("Checkbox", () => {
  it("is a checkbox named by its label", () => {
    render(<Checkbox label="Collect billing address" />)

    expect(screen.getByRole("checkbox", { name: "Collect billing address" })).toBeInTheDocument()
  })

  it("is unchecked to begin with", () => {
    render(<Checkbox label="Remember me" />)

    expect(screen.getByRole("checkbox")).not.toBeChecked()
  })

  it("toggles when its label is clicked, not only the box", async () => {
    // The label is the larger target, and the one people aim at.
    render(<Checkbox label="Remember me" />)

    await userEvent.click(screen.getByText("Remember me"))

    expect(screen.getByRole("checkbox")).toBeChecked()
  })

  it("reports the new state to its handler", async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Remember me" onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole("checkbox"))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  describe("controlled", () => {
    it("shows only what its owner allows", async () => {
      function Locked() {
        const [checked, setChecked] = useState(false)
        return (
          <>
            <Checkbox label="Locked" checked={checked} onCheckedChange={() => setChecked(false)} />
            <button onClick={() => setChecked(true)}>Force on</button>
          </>
        )
      }

      render(<Locked />)

      await userEvent.click(screen.getByRole("checkbox"))
      expect(screen.getByRole("checkbox")).not.toBeChecked()

      await userEvent.click(screen.getByRole("button", { name: "Force on" }))
      expect(screen.getByRole("checkbox")).toBeChecked()
    })
  })

  describe("indeterminate", () => {
    it("announces a mixed state rather than guessing", () => {
      // A "select all" box over a partial selection is neither checked nor
      // unchecked, and saying either would be a lie.
      render(<Checkbox label="Select all" checked="indeterminate" />)

      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed")
    })
  })

  describe("disabled", () => {
    it("does not toggle", async () => {
      render(<Checkbox label="Remember me" disabled />)

      await userEvent.click(screen.getByRole("checkbox"))

      expect(screen.getByRole("checkbox")).not.toBeChecked()
    })

    it("is skipped by Tab", async () => {
      render(
        <>
          <Checkbox label="First" disabled />
          <Checkbox label="Second" />
        </>,
      )

      await userEvent.tab()

      expect(screen.getByRole("checkbox", { name: "Second" })).toHaveFocus()
    })
  })

  describe("description and error", () => {
    it("announces both as the control's description", () => {
      render(<Checkbox label="Terms" description="You can change this later" error="Required" />)

      expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
        "You can change this later Required",
      )
      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true")
    })

    it("says what is wrong in words", () => {
      render(<Checkbox label="Terms" error="You must accept the terms" />)

      expect(screen.getByRole("alert")).toHaveTextContent("You must accept the terms")
    })
  })

  describe("keyboard", () => {
    it("toggles with Space", async () => {
      render(<Checkbox label="Remember me" />)

      await userEvent.tab()
      await userEvent.keyboard(" ")

      expect(screen.getByRole("checkbox")).toBeChecked()
    })
  })

  it("lets the caller's className win a conflict", () => {
    render(<Checkbox label="Remember me" className="rounded-pill" />)

    const classes = screen.getByRole("checkbox").className.split(" ")
    expect(classes).toContain("rounded-pill")
    expect(classes).not.toContain("rounded-tight")
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = render(<Checkbox label="Remember me" />)

      await expectNoViolations(container)
    })

    it("reports no axe violations with a description and an error", async () => {
      const { container } = render(
        <Checkbox label="Terms" description="Optional context" error="Required" />,
      )

      await expectNoViolations(container)
    })
  })
})
