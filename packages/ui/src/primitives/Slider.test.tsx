import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Slider } from "./Slider"
import { expectNoViolations } from "../../tests/axe"

describe("Slider", () => {
  it("is a labelled slider", () => {
    render(<Slider label="Opacity" defaultValue={[50]} />)

    expect(screen.getByRole("slider", { name: "Opacity" })).toBeInTheDocument()
  })

  it("reports its value and its range to assistive technology", () => {
    render(<Slider label="Opacity" min={0} max={100} defaultValue={[40]} />)

    const slider = screen.getByRole("slider")
    expect(slider).toHaveAttribute("aria-valuenow", "40")
    expect(slider).toHaveAttribute("aria-valuemin", "0")
    expect(slider).toHaveAttribute("aria-valuemax", "100")
  })

  it("shows the current value, so it can be checked without dragging", () => {
    // A value visible only while the thumb is held is a value nobody can read.
    render(
      <Slider label="Opacity" defaultValue={[40]} formatValue={([value]) => `${value ?? 0}%`} />,
    )

    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("renders one thumb per value", () => {
    render(<Slider label="Range" defaultValue={[20, 80]} />)

    expect(screen.getAllByRole("slider")).toHaveLength(2)
  })

  it("names each end of a range, because the label alone names neither", () => {
    // "Price" announced twice tells a reader which control they are on exactly
    // as well as saying nothing would.
    render(<Slider label="Price" defaultValue={[20, 80]} />)

    expect(screen.getByRole("slider", { name: "Price minimum" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Price maximum" })).toBeInTheDocument()
  })

  it("numbers the thumbs when there are more than two", () => {
    render(<Slider label="Stops" defaultValue={[10, 50, 90]} />)

    expect(screen.getByRole("slider", { name: "Stops 1" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Stops 3" })).toBeInTheDocument()
  })

  describe("keyboard", () => {
    it("moves by one step with the arrow keys", async () => {
      const onValueChange = vi.fn()
      render(<Slider label="Opacity" defaultValue={[50]} onValueChange={onValueChange} />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowRight}")

      expect(onValueChange).toHaveBeenCalledWith([51])
    })

    it("respects a step larger than one", async () => {
      const onValueChange = vi.fn()
      render(<Slider label="Opacity" step={10} defaultValue={[50]} onValueChange={onValueChange} />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowRight}")

      expect(onValueChange).toHaveBeenCalledWith([60])
    })

    it("jumps to the ends with Home and End", async () => {
      const onValueChange = vi.fn()
      render(
        <Slider
          label="Opacity"
          min={0}
          max={100}
          defaultValue={[50]}
          onValueChange={onValueChange}
        />,
      )

      await userEvent.tab()
      await userEvent.keyboard("{End}")
      expect(onValueChange).toHaveBeenLastCalledWith([100])

      await userEvent.keyboard("{Home}")
      expect(onValueChange).toHaveBeenLastCalledWith([0])
    })

    it("stops at its bounds", async () => {
      const onValueChange = vi.fn()
      render(
        <Slider
          label="Opacity"
          min={0}
          max={100}
          defaultValue={[100]}
          onValueChange={onValueChange}
        />,
      )

      await userEvent.tab()
      await userEvent.keyboard("{ArrowRight}")

      expect(onValueChange).not.toHaveBeenCalled()
    })
  })

  it("works controlled", async () => {
    function Stuck() {
      const [value, setValue] = useState([50])
      return <Slider label="Opacity" value={value} onValueChange={() => setValue([50])} />
    }

    render(<Stuck />)

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "50")
  })

  it("announces its description", () => {
    render(<Slider label="Opacity" defaultValue={[50]} description="Applies to the whole layer" />)

    expect(screen.getByRole("slider").closest("span")).toBeTruthy()
    expect(screen.getByText("Applies to the whole layer")).toBeInTheDocument()
  })

  it("cannot be moved when disabled", async () => {
    const onValueChange = vi.fn()
    render(<Slider label="Opacity" defaultValue={[50]} disabled onValueChange={onValueChange} />)

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Slider label="Opacity" defaultValue={[50]} formatValue={([value]) => `${value ?? 0}%`} />,
    )

    await expectNoViolations(container)
  })
})
