import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Switch } from "./Switch"
import { expectNoViolations } from "../../tests/axe"

describe("Switch", () => {
  it("is a switch, not a checkbox", () => {
    // The distinction is the point: a switch takes effect now, a checkbox takes
    // effect when the form is submitted, and role is how a reader tells them
    // apart.
    render(<Switch label="Live mode" />)

    expect(screen.getByRole("switch", { name: "Live mode" })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("is off to begin with", () => {
    render(<Switch label="Live mode" />)

    expect(screen.getByRole("switch")).not.toBeChecked()
  })

  it("turns on when clicked, and reports it", async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Live mode" onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole("switch"))

    expect(screen.getByRole("switch")).toBeChecked()
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it("toggles from its label", async () => {
    render(<Switch label="Live mode" />)

    await userEvent.click(screen.getByText("Live mode"))

    expect(screen.getByRole("switch")).toBeChecked()
  })

  it("works controlled", async () => {
    function Guarded() {
      const [on, setOn] = useState(false)
      return <Switch label="Live mode" checked={on} onCheckedChange={() => setOn(false)} />
    }

    render(<Guarded />)
    await userEvent.click(screen.getByRole("switch"))

    expect(screen.getByRole("switch")).not.toBeChecked()
  })

  it("announces its description", () => {
    render(<Switch label="Live mode" description="Charges real cards" />)

    expect(screen.getByRole("switch")).toHaveAccessibleDescription("Charges real cards")
  })

  it("does not toggle when disabled", async () => {
    render(<Switch label="Live mode" disabled />)

    await userEvent.click(screen.getByRole("switch"))

    expect(screen.getByRole("switch")).not.toBeChecked()
  })

  it("toggles with Space from the keyboard", async () => {
    render(<Switch label="Live mode" />)

    await userEvent.tab()
    await userEvent.keyboard(" ")

    expect(screen.getByRole("switch")).toBeChecked()
  })

  it("reports no axe violations in either state", async () => {
    const off = render(<Switch label="Live mode" description="Charges real cards" />)
    await expectNoViolations(off.container)
    off.unmount()

    const on = render(<Switch label="Live mode" defaultChecked />)
    await expectNoViolations(on.container)
  })
})
