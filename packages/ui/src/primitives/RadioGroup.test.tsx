import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Radio, RadioGroup } from "./RadioGroup"
import { expectNoViolations } from "../../tests/axe"

function Plans(props: Partial<Parameters<typeof RadioGroup>[0]> = {}) {
  return (
    <RadioGroup label="Plan" {...props}>
      <Radio value="free" label="Free" />
      <Radio value="pro" label="Pro" description="Custom domains" />
      <Radio value="scale" label="Scale" />
    </RadioGroup>
  )
}

describe("RadioGroup", () => {
  it("is a group named by its label", () => {
    render(<Plans />)

    expect(screen.getByRole("radiogroup", { name: "Plan" })).toBeInTheDocument()
  })

  it("renders one radio per option, each named by its label", () => {
    render(<Plans />)

    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("radio", { name: "Free" })).toBeInTheDocument()
  })

  it("starts with nothing chosen unless given a default", () => {
    render(<Plans />)

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked()
    }
  })

  it("honours a default", () => {
    render(<Plans defaultValue="pro" />)

    expect(screen.getByRole("radio", { name: /Pro/ })).toBeChecked()
  })

  it("reports the chosen value", async () => {
    const onValueChange = vi.fn()
    render(<Plans onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole("radio", { name: "Free" }))

    expect(onValueChange).toHaveBeenCalledWith("free")
  })

  it("allows only one choice at a time", async () => {
    render(<Plans />)

    await userEvent.click(screen.getByRole("radio", { name: "Free" }))
    await userEvent.click(screen.getByRole("radio", { name: "Scale" }))

    expect(screen.getByRole("radio", { name: "Free" })).not.toBeChecked()
    expect(screen.getByRole("radio", { name: "Scale" })).toBeChecked()
  })

  it("works controlled", async () => {
    function Fixed() {
      const [value, setValue] = useState("free")
      return (
        <>
          <Plans value={value} onValueChange={() => setValue("free")} />
          <button onClick={() => setValue("scale")}>Choose Scale</button>
        </>
      )
    }

    render(<Fixed />)

    await userEvent.click(screen.getByRole("radio", { name: "Scale" }))
    expect(screen.getByRole("radio", { name: "Free" })).toBeChecked()

    await userEvent.click(screen.getByRole("button", { name: "Choose Scale" }))
    expect(screen.getByRole("radio", { name: "Scale" })).toBeChecked()
  })

  it("announces a per-option description", () => {
    render(<Plans />)

    expect(screen.getByRole("radio", { name: /Pro/ })).toHaveAccessibleDescription("Custom domains")
  })

  it("announces the group's description and error", () => {
    render(<Plans description="You can change this any time" error="Choose a plan" />)

    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      "You can change this any time Choose a plan",
    )
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a plan")
  })

  describe("keyboard", () => {
    it("takes one Tab stop for the whole group", async () => {
      // A group of radios is one control. Tabbing through every option would
      // make a long form unusable, which is why arrow keys move within it.
      render(
        <>
          <Plans defaultValue="free" />
          <button>After</button>
        </>,
      )

      await userEvent.tab()
      expect(screen.getByRole("radio", { name: "Free" })).toHaveFocus()

      await userEvent.tab()
      expect(screen.getByRole("button", { name: "After" })).toHaveFocus()
    })

    /*
     * These assert that focus moves, not that selection follows it.
     *
     * Radix couples the two through a flag it sets on a document keydown and
     * clears on keyup, read when the newly focused item fires onFocus. In a
     * browser the focus lands between those two events; under jsdom both key
     * events are flushed before React applies focus, so the flag is already
     * clear and nothing is selected. That is the environment, not the
     * component — selection following focus belongs to the browser-driven
     * suite, where a real event loop can show it.
     */
    it("moves focus between options with the arrow keys", async () => {
      render(<Plans defaultValue="free" />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowDown}")

      expect(screen.getByRole("radio", { name: /Pro/ })).toHaveFocus()
    })

    it("wraps from the last option to the first", async () => {
      render(<Plans defaultValue="scale" />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowDown}")

      expect(screen.getByRole("radio", { name: "Free" })).toHaveFocus()
    })

    it("selects the focused option with Space", async () => {
      render(<Plans />)

      await userEvent.tab()
      await userEvent.keyboard(" ")

      expect(screen.getByRole("radio", { name: "Free" })).toBeChecked()
    })
  })

  it("does not choose a disabled option", async () => {
    render(
      <RadioGroup label="Plan">
        <Radio value="free" label="Free" />
        <Radio value="enterprise" label="Enterprise" disabled />
      </RadioGroup>,
    )

    await userEvent.click(screen.getByRole("radio", { name: "Enterprise" }))

    expect(screen.getByRole("radio", { name: "Enterprise" })).not.toBeChecked()
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = render(<Plans defaultValue="pro" />)

      await expectNoViolations(container)
    })

    it("reports no axe violations with a hidden group label", async () => {
      const { container } = render(<Plans labelHidden />)

      await expectNoViolations(container)
    })
  })
})
