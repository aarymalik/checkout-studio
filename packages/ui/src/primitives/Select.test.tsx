import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Select, SelectGroup, SelectOption, SelectSeparator } from "./Select"
import { expectNoViolations } from "../../tests/axe"

function Currencies(props: Partial<Parameters<typeof Select>[0]> = {}) {
  return (
    <Select label="Currency" {...props}>
      <SelectOption value="gbp">Pound sterling</SelectOption>
      <SelectOption value="usd">US dollar</SelectOption>
      <SelectOption value="eur">Euro</SelectOption>
    </Select>
  )
}

describe("Select", () => {
  it("is a combobox named by its label", () => {
    render(<Currencies />)

    expect(screen.getByRole("combobox", { name: "Currency" })).toBeInTheDocument()
  })

  it("shows a placeholder until something is chosen", () => {
    render(<Currencies placeholder="Pick one" />)

    expect(screen.getByRole("combobox")).toHaveTextContent("Pick one")
  })

  it("does not lean on the placeholder for its name", () => {
    render(<Currencies placeholder="Pick one" />)

    expect(screen.getByRole("combobox")).toHaveAccessibleName("Currency")
  })

  it("shows the chosen value rather than the placeholder", () => {
    render(<Currencies defaultValue="usd" />)

    expect(screen.getByRole("combobox")).toHaveTextContent("US dollar")
  })

  it("keeps its options out of the document until it is opened", () => {
    render(<Currencies />)

    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })

  it("opens on click and lists its options", async () => {
    render(<Currencies />)

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.getAllByRole("option")).toHaveLength(3)
  })

  it("reports the value that was chosen", async () => {
    const onValueChange = vi.fn()
    render(<Currencies onValueChange={onValueChange} />)

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Euro" }))

    expect(onValueChange).toHaveBeenCalledWith("eur")
  })

  it("closes once a choice is made, and shows it", async () => {
    render(<Currencies />)

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Euro" }))

    expect(screen.queryByRole("option")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveTextContent("Euro")
  })

  it("works controlled", async () => {
    function Locked() {
      const [value, setValue] = useState("gbp")
      return <Currencies value={value} onValueChange={() => setValue("gbp")} />
    }

    render(<Locked />)

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Euro" }))

    expect(screen.getByRole("combobox")).toHaveTextContent("Pound sterling")
  })

  it("marks which option is the current one", async () => {
    render(<Currencies defaultValue="usd" />)

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.getByRole("option", { name: "US dollar" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })

  it.each(["sm", "md", "lg"] as const)("renders the %s trigger height", (size) => {
    render(<Currencies size={size} />)

    expect(screen.getByRole("combobox").className).toContain(`h-control-${size}`)
  })

  it("announces its description and error", () => {
    render(<Currencies description="Charged in this currency" error="Choose a currency" />)

    expect(screen.getByRole("combobox")).toHaveAccessibleDescription(
      "Charged in this currency Choose a currency",
    )
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true")
  })

  it("does not open when disabled", async () => {
    render(<Currencies disabled />)

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })

  describe("keyboard", () => {
    it("opens with Enter from the trigger", async () => {
      render(<Currencies />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")

      expect(screen.getAllByRole("option")).toHaveLength(3)
    })

    it("closes with Escape and returns focus to the trigger", async () => {
      // Losing focus to the body on close is how a keyboard user gets stranded.
      render(<Currencies />)

      await userEvent.click(screen.getByRole("combobox"))
      await userEvent.keyboard("{Escape}")

      expect(screen.queryByRole("option")).not.toBeInTheDocument()
      expect(screen.getByRole("combobox")).toHaveFocus()
    })

    it("chooses an option with the keyboard alone", async () => {
      render(<Currencies />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")
      await userEvent.keyboard("{ArrowDown}{Enter}")

      expect(screen.getByRole("combobox")).toHaveTextContent(/Pound sterling|US dollar/)
    })
  })

  describe("groups", () => {
    it("labels a section of options", async () => {
      render(
        <Select label="Currency">
          <SelectGroup label="Common">
            <SelectOption value="gbp">Pound sterling</SelectOption>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup label="Other">
            <SelectOption value="jpy">Japanese yen</SelectOption>
          </SelectGroup>
        </Select>,
      )

      await userEvent.click(screen.getByRole("combobox"))

      expect(screen.getByRole("group", { name: "Common" })).toBeInTheDocument()
      expect(screen.getByRole("group", { name: "Other" })).toBeInTheDocument()
    })
  })

  it("does not choose a disabled option", async () => {
    const onValueChange = vi.fn()
    render(
      <Select label="Currency" onValueChange={onValueChange}>
        <SelectOption value="gbp">Pound sterling</SelectOption>
        <SelectOption value="xxx" disabled>
          Unavailable
        </SelectOption>
      </Select>,
    )

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(screen.getByRole("option", { name: "Unavailable" }))

    expect(onValueChange).not.toHaveBeenCalled()
  })

  describe("accessibility", () => {
    it("reports no axe violations closed", async () => {
      const { container } = render(<Currencies description="Charged in this currency" />)

      await expectNoViolations(container)
    })

    it("reports no axe violations open", async () => {
      render(<Currencies />)

      await userEvent.click(screen.getByRole("combobox"))

      // The options render in a portal, so the whole document is the subject.
      await expectNoViolations(document.body)
    })
  })
})
