import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { SearchInput } from "./SearchInput"
import { expectNoViolations } from "../../tests/axe"

function Searchable({ initial = "" } = {}) {
  const [value, setValue] = useState(initial)
  return <SearchInput label="Search pages" value={value} onValueChange={setValue} />
}

describe("SearchInput", () => {
  it("is announced as a search field", () => {
    render(<Searchable />)

    expect(screen.getByRole("searchbox", { name: "Search pages" })).toBeInTheDocument()
  })

  it("is labelled even when the label is not shown", () => {
    render(<Searchable />)

    expect(screen.getByRole("searchbox")).toHaveAccessibleName("Search pages")
  })

  it("can show its label", () => {
    render(
      <SearchInput label="Search pages" labelHidden={false} value="" onValueChange={vi.fn()} />,
    )

    expect(screen.getByText("Search pages")).toBeVisible()
  })

  it("reports what was typed", async () => {
    const onValueChange = vi.fn()
    render(<SearchInput label="Search" value="" onValueChange={onValueChange} />)

    await userEvent.type(screen.getByRole("searchbox"), "home")

    expect(onValueChange).toHaveBeenCalledWith("h")
  })

  describe("the clear button", () => {
    it("is absent when there is nothing to clear", () => {
      render(<Searchable />)

      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument()
    })

    it("appears once there is", async () => {
      render(<Searchable />)

      await userEvent.type(screen.getByRole("searchbox"), "home")

      expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument()
    })

    it("empties the field", async () => {
      render(<Searchable initial="home" />)

      await userEvent.click(screen.getByRole("button", { name: "Clear search" }))

      expect(screen.getByRole("searchbox")).toHaveValue("")
    })

    it("returns focus to the field, because the next thing is another search", async () => {
      render(<Searchable initial="home" />)

      await userEvent.click(screen.getByRole("button", { name: "Clear search" }))

      expect(screen.getByRole("searchbox")).toHaveFocus()
    })
  })

  it("hides the browser's own clear button, which would sit beside ours", () => {
    render(<Searchable initial="home" />)

    expect(screen.getByRole("searchbox").className).toContain(
      "[&::-webkit-search-cancel-button]:hidden",
    )
  })

  it("reports no axe violations", async () => {
    const { container } = render(<Searchable initial="home" />)

    await expectNoViolations(container)
  })
})
