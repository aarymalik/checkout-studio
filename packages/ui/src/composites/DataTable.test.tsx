import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { DataTable } from "./DataTable"
import type { Column } from "./DataTable"
import { expectNoViolations } from "../../tests/axe"

interface Page {
  id: string
  name: string
  views: number
}

const PAGES: Page[] = [
  { id: "b", name: "Checkout", views: 120 },
  { id: "a", name: "Home", views: 30 },
  { id: "c", name: "About", views: 120 },
]

const COLUMNS: ReadonlyArray<Column<Page>> = [
  {
    id: "name",
    header: "Name",
    cell: (page) => page.name,
    compare: (a, b) => a.name.localeCompare(b.name),
  },
  {
    id: "views",
    header: "Views",
    cell: (page) => page.views,
    compare: (a, b) => a.views - b.views,
    align: "end",
  },
  { id: "actions", header: "Actions", cell: () => "…" },
]

function names(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[0]?.textContent ?? "")
}

function Table(props: Partial<Parameters<typeof DataTable<Page>>[0]> = {}) {
  return (
    <DataTable
      caption="Pages in this project"
      columns={COLUMNS}
      rows={PAGES}
      rowId={(page) => page.id}
      {...props}
    />
  )
}

describe("DataTable", () => {
  it("is a table with a caption, so it can be understood out of context", () => {
    // The semantics are how a screen reader user moves by row and column and
    // hears which column they are in.
    render(<Table />)

    expect(screen.getByRole("table", { name: "Pages in this project" })).toBeInTheDocument()
  })

  it("can hide the caption while keeping it announced", () => {
    render(<Table captionHidden />)

    expect(screen.getByRole("table", { name: "Pages in this project" })).toBeInTheDocument()
  })

  it("renders a header per column and a row per record", () => {
    render(<Table />)

    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
    expect(screen.getAllByRole("row")).toHaveLength(4)
  })

  describe("sorting", () => {
    it("says a sortable column is unsorted rather than saying nothing", () => {
      render(<Table />)

      expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
        "aria-sort",
        "none",
      )
    })

    it("does not claim a column can be sorted when it cannot", () => {
      render(<Table />)

      expect(screen.getByRole("columnheader", { name: "Actions" })).not.toHaveAttribute("aria-sort")
    })

    it("sorts ascending on the first press, and announces it", async () => {
      render(<Table />)

      await userEvent.click(screen.getByRole("button", { name: "Name" }))

      expect(names()).toEqual(["About", "Checkout", "Home"])
      expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
        "aria-sort",
        "ascending",
      )
    })

    it("sorts descending on the second", async () => {
      render(<Table />)

      await userEvent.click(screen.getByRole("button", { name: "Name" }))
      await userEvent.click(screen.getByRole("button", { name: "Name" }))

      expect(names()).toEqual(["Home", "Checkout", "About"])
      expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
        "aria-sort",
        "descending",
      )
    })

    it("returns to the original order on the third, which is a state worth having", async () => {
      render(<Table />)

      const header = screen.getByRole("button", { name: "Name" })
      await userEvent.click(header)
      await userEvent.click(header)
      await userEvent.click(header)

      expect(names()).toEqual(["Checkout", "Home", "About"])
    })

    it("keeps rows that compare equal in a stable order in both directions", async () => {
      // Reversing a sorted array also reverses ties, so Checkout and About
      // would swap places every time the direction changed.
      render(<Table />)

      await userEvent.click(screen.getByRole("button", { name: "Views" }))
      const ascending = names()

      await userEvent.click(screen.getByRole("button", { name: "Views" }))
      const descending = names()

      expect(ascending).toEqual(["Home", "Checkout", "About"])
      expect(descending.slice(0, 2)).toEqual(["Checkout", "About"])
    })

    it("sorts from the keyboard", async () => {
      render(<Table />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")

      expect(names()).toEqual(["About", "Checkout", "Home"])
    })
  })

  describe("selection", () => {
    function Selectable() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
      return (
        <Table
          selection={{
            selected,
            onChange: setSelected,
            label: (page) => `Select ${page.name}`,
          }}
        />
      )
    }

    it("offers a checkbox per row, named after the row", async () => {
      render(<Selectable />)

      expect(screen.getByRole("checkbox", { name: "Select Home" })).toBeInTheDocument()
    })

    it("reports what is selected", async () => {
      const onChange = vi.fn()
      render(
        <Table
          selection={{ selected: new Set(), onChange, label: (page) => `Select ${page.name}` }}
        />,
      )

      await userEvent.click(screen.getByRole("checkbox", { name: "Select Home" }))

      expect(onChange).toHaveBeenCalledWith(new Set(["a"]))
    })

    it("marks a selected row as selected, not merely tinted", async () => {
      render(<Selectable />)

      await userEvent.click(screen.getByRole("checkbox", { name: "Select Home" }))

      expect(screen.getByRole("row", { selected: true })).toBeInTheDocument()
    })

    it("selects everything from the header", async () => {
      render(<Selectable />)

      await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }))

      expect(screen.getAllByRole("row", { selected: true })).toHaveLength(3)
    })

    it("announces a partial selection as mixed rather than guessing", async () => {
      render(<Selectable />)

      await userEvent.click(screen.getByRole("checkbox", { name: "Select Home" }))

      expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveAttribute(
        "aria-checked",
        "mixed",
      )
    })

    it("clears everything from the header once all are selected", async () => {
      render(<Selectable />)

      await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }))
      await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }))

      expect(screen.queryByRole("row", { selected: true })).not.toBeInTheDocument()
    })
  })

  describe("when there is nothing to show", () => {
    it("says so rather than rendering an empty body", () => {
      render(<Table rows={[]} />)

      expect(screen.getByText("Nothing to show.")).toBeInTheDocument()
    })

    it("takes a message of its own", () => {
      render(<Table rows={[]} empty="No pages match this filter." />)

      expect(screen.getByText("No pages match this filter.")).toBeInTheDocument()
    })

    it("spans the whole width, so the message is not squeezed into one column", () => {
      render(<Table rows={[]} />)

      expect(screen.getByRole("cell")).toHaveAttribute("colspan", "3")
    })
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Table
        selection={{
          selected: new Set(["a"]),
          onChange: vi.fn(),
          label: (page) => `Select ${page.name}`,
        }}
      />,
    )

    await expectNoViolations(container)
  })
})
