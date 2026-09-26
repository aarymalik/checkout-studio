import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ColorPicker } from "./ColorPicker"
import { expectNoViolations } from "../../tests/axe"

function Editable({
  initial = "#2563eb",
  ...rest
}: { initial?: string } & Record<string, unknown>) {
  const [value, setValue] = useState(initial)
  return <ColorPicker label="Brand" value={value} onChange={setValue} {...rest} />
}

async function open(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: /Brand/ }))
}

describe("ColorPicker", () => {
  it("shows the current colour on its trigger", () => {
    render(<Editable />)

    expect(screen.getByRole("button", { name: /Brand/ })).toHaveTextContent("#2563eb")
  })

  it("keeps its controls out of the document until it is opened", () => {
    render(<Editable />)

    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  })

  it("offers hue, saturation and lightness rather than a drag area", async () => {
    // A two-dimensional gradient square reports a colour only to someone who
    // can see it and use a pointer: there is no keyboard equivalent to "a bit
    // further up and to the left".
    render(<Editable />)

    await open()

    expect(screen.getByRole("slider", { name: "Hue" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Saturation" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Lightness" })).toBeInTheDocument()
  })

  it("reads the current colour into its sliders", async () => {
    render(<Editable initial="#ff0000" />)

    await open()

    expect(screen.getByRole("slider", { name: "Hue" })).toHaveAttribute("aria-valuenow", "0")
    expect(screen.getByRole("slider", { name: "Saturation" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    )
    expect(screen.getByRole("slider", { name: "Lightness" })).toHaveAttribute("aria-valuenow", "50")
  })

  it("changes the colour from the keyboard", async () => {
    const onChange = vi.fn()
    render(<ColorPicker label="Brand" value="#ff0000" onChange={onChange} />)

    await open()
    screen.getByRole("slider", { name: "Hue" }).focus()
    await userEvent.keyboard("{ArrowRight}")

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatch(/^#[0-9a-f]{6}$/)
    expect(onChange.mock.calls[0]?.[0]).not.toBe("#ff0000")
  })

  it.each([
    ["Saturation", "#808080"],
    ["Lightness", "#ff0000"],
  ] as const)("changes the colour from the %s slider", async (channel, from) => {
    const onChange = vi.fn()
    render(<ColorPicker label="Brand" value={from} onChange={onChange} />)

    await open()
    screen.getByRole("slider", { name: channel }).focus()
    await userEvent.keyboard("{ArrowRight}")

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).not.toBe(from)
  })

  it("shows each channel's value in its own units", async () => {
    render(<Editable initial="#ff0000" />)

    await open()

    expect(screen.getByText("0°")).toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("does not shift the colour just by being opened", async () => {
    // Reading a colour into sliders and writing it back has to be lossless, or
    // every visit to the picker nudges the brand.
    const onChange = vi.fn()
    render(<ColorPicker label="Brand" value="#eff6ff" onChange={onChange} />)

    await open()

    expect(onChange).not.toHaveBeenCalled()
  })

  describe("the hex field", () => {
    it("accepts a typed colour", async () => {
      render(<Editable />)

      await open()
      const field = screen.getByLabelText("Hex")
      await userEvent.clear(field)
      await userEvent.type(field, "#00ff00")

      expect(screen.getByRole("slider", { name: "Hue" })).toHaveAttribute("aria-valuenow", "120")
    })

    it("holds a half-typed value without reporting it", async () => {
      // "#25" is not a colour. Reporting each keystroke would repaint the
      // interface with whatever that resolves to.
      const onChange = vi.fn()
      render(<ColorPicker label="Brand" value="#2563eb" onChange={onChange} />)

      await open()
      const field = screen.getByLabelText("Hex")
      await userEvent.clear(field)
      await userEvent.type(field, "#25")

      expect(onChange).not.toHaveBeenCalled()
      expect(field).toHaveValue("#25")
    })

    it("says what a colour looks like when the value cannot be read", async () => {
      render(<Editable />)

      await open()
      const field = screen.getByLabelText("Hex")
      await userEvent.clear(field)
      await userEvent.type(field, "nope")

      expect(screen.getByRole("alert")).toHaveTextContent("Enter a colour like #2563eb")
      expect(field).toHaveAttribute("aria-invalid", "true")
    })

    it("accepts the short form and normalises it", async () => {
      const onChange = vi.fn()
      render(<ColorPicker label="Brand" value="#2563eb" onChange={onChange} />)

      await open()
      const field = screen.getByLabelText("Hex")
      await userEvent.clear(field)
      await userEvent.type(field, "#FFF")

      expect(onChange).toHaveBeenLastCalledWith("#ffffff")
    })
  })

  describe("presets", () => {
    const presets = [
      { value: "#2563eb", label: "Blue" },
      { value: "#dc2626", label: "Red" },
    ] as const

    it("applies a preset in one click", async () => {
      const onChange = vi.fn()
      render(<ColorPicker label="Brand" value="#2563eb" onChange={onChange} presets={presets} />)

      await open()
      await userEvent.click(screen.getByRole("button", { name: "Red" }))

      expect(onChange).toHaveBeenCalledWith("#dc2626")
    })

    it("marks the one that is in use", async () => {
      render(<ColorPicker label="Brand" value="#2563eb" onChange={vi.fn()} presets={presets} />)

      await open()

      expect(screen.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "false")
    })

    it("recognises the same colour written differently", async () => {
      render(
        <ColorPicker
          label="Brand"
          value="#FFF"
          onChange={vi.fn()}
          presets={[{ value: "#ffffff", label: "White" }]}
        />,
      )

      await open()

      expect(screen.getByRole("button", { name: "White" })).toHaveAttribute("aria-pressed", "true")
    })
  })

  it("cannot be opened when disabled", async () => {
    render(<Editable disabled />)

    await open()

    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  })

  it("reports no axe violations while open", async () => {
    render(
      <Editable presets={[{ value: "#2563eb", label: "Blue" }]} description="Used for buttons" />,
    )

    await open()

    await expectNoViolations(document.body)
  })
})
