import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Splitter } from "./Splitter"
import { expectNoViolations } from "../../tests/axe"

function setup(overrides: Partial<Parameters<typeof Splitter>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <Splitter
      label="Resize Layers"
      value={320}
      min={260}
      max={420}
      onChange={onChange}
      {...overrides}
    />,
  )
  return { onChange }
}

describe("Splitter", () => {
  it("is a separator that reports where it is", () => {
    // A divider that only responds to a drag is a layout nobody can adjust
    // without a mouse.
    setup()

    const separator = screen.getByRole("separator", { name: "Resize Layers" })
    expect(separator).toHaveAttribute("aria-valuenow", "320")
    expect(separator).toHaveAttribute("aria-valuemin", "260")
    expect(separator).toHaveAttribute("aria-valuemax", "420")
  })

  it("is reachable by Tab", async () => {
    setup()

    await userEvent.tab()

    expect(screen.getByRole("separator")).toHaveFocus()
  })

  it.each(["{ArrowRight}", "{ArrowDown}"])("grows with %s", async (key) => {
    const { onChange } = setup()

    await userEvent.tab()
    await userEvent.keyboard(key)

    expect(onChange).toHaveBeenCalledWith(336)
  })

  it.each(["{ArrowLeft}", "{ArrowUp}"])("shrinks with %s", async (key) => {
    const { onChange } = setup()

    await userEvent.tab()
    await userEvent.keyboard(key)

    expect(onChange).toHaveBeenCalledWith(304)
  })

  it("takes a step of its own", async () => {
    const { onChange } = setup({ step: 40 })

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(onChange).toHaveBeenCalledWith(360)
  })

  it("goes to its limits with Home and End", async () => {
    const { onChange } = setup()

    await userEvent.tab()
    await userEvent.keyboard("{Home}")
    expect(onChange).toHaveBeenLastCalledWith(260)

    await userEvent.keyboard("{End}")
    expect(onChange).toHaveBeenLastCalledWith(420)
  })

  it("stops at its bounds rather than reporting a width nobody can use", async () => {
    const { onChange } = setup({ value: 420 })

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(onChange).toHaveBeenCalledWith(420)
  })

  it("ignores keys that are not its own", async () => {
    const { onChange } = setup()

    await userEvent.tab()
    await userEvent.keyboard("{Enter}a")

    expect(onChange).not.toHaveBeenCalled()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Splitter label="Resize Layers" value={320} min={260} max={420} onChange={vi.fn()} />,
    )

    await expectNoViolations(container)
  })
})
