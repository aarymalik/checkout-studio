import { ArrowDown, ArrowUp } from "lucide-react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Checkbox } from "../primitives/Checkbox"
import { cn } from "../lib/cn"

/**
 * A table of records.
 *
 * A real `<table>` with a real `<caption>`, not a grid of divs: the semantics
 * are how a screen reader user moves by row and column and hears which column
 * they are in. Sorting is announced through `aria-sort` on the header rather
 * than by the arrow alone.
 *
 * Long lists are not virtualised here. Virtualisation belongs to the panels
 * listed in docs/performance.md and arrives with Phase 19; adding it now would
 * be a scroll container nobody has measured.
 */
export interface Column<Row> {
  /** Stable key. Also the sort key. */
  id: string
  header: ReactNode
  /** What to show in the cell. */
  cell: (row: Row) => ReactNode
  /** How to order by this column. Omit for a column that cannot be sorted. */
  compare?: (a: Row, b: Row) => number
  /** Right-align a numeric column, so digits line up. */
  align?: "start" | "end"
}

export type SortDirection = "ascending" | "descending"

export interface DataTableProps<Row> {
  /** Describes the table for a screen reader. Shown unless hidden. */
  caption: string
  captionHidden?: boolean
  columns: ReadonlyArray<Column<Row>>
  rows: ReadonlyArray<Row>
  /** A stable identity per row. */
  rowId: (row: Row) => string
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode
  /** Turns on row selection, and reports what is selected. */
  selection?: {
    selected: ReadonlySet<string>
    onChange: (selected: ReadonlySet<string>) => void
    /** Describes a row's checkbox: "Select the Home page". */
    label: (row: Row) => string
  }
}

export function DataTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowId,
  empty,
  selection,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(null)

  const sorted = useMemo(() => {
    if (sort === null) return rows

    const column = columns.find((candidate) => candidate.id === sort.id)
    if (column?.compare === undefined) return rows

    // Negating the comparator rather than reversing the result: reversing a
    // sorted array also reverses rows that compared equal, so ties would
    // reshuffle every time the direction changed.
    const compare = column.compare
    const direction = sort.direction === "ascending" ? 1 : -1
    return [...rows].sort((a, b) => direction * compare(a, b))
  }, [rows, columns, sort])

  function toggleSort(column: Column<Row>): void {
    if (column.compare === undefined) return

    setSort((current) =>
      current?.id === column.id
        ? current.direction === "ascending"
          ? { id: column.id, direction: "descending" }
          : // A third press clears the sort rather than cycling forever: the
            // order the rows arrived in is a meaningful state.
            null
        : { id: column.id, direction: "ascending" },
    )
  }

  const allSelected =
    selection !== undefined &&
    rows.length > 0 &&
    rows.every((row) => selection.selected.has(rowId(row)))
  const someSelected =
    selection !== undefined && rows.some((row) => selection.selected.has(rowId(row)))

  return (
    <table className="w-full border-collapse text-body">
      <caption
        className={cn(
          "pb-2 text-left text-small text-foreground-muted",
          captionHidden && "sr-only",
        )}
      >
        {caption}
      </caption>

      <thead>
        <tr className="border-b border-border">
          {selection === undefined ? null : (
            <th scope="col" className="w-10 p-2">
              <Checkbox
                label="Select all rows"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  selection.onChange(
                    checked === true ? new Set(rows.map(rowId)) : new Set<string>(),
                  )
                }
              />
            </th>
          )}

          {columns.map((column) => {
            const active = sort?.id === column.id
            const sortable = column.compare !== undefined

            return (
              <th
                key={column.id}
                scope="col"
                // aria-sort is how the order is announced. The arrow says it to
                // everyone who can see it and to nobody else.
                aria-sort={active ? sort.direction : sortable ? "none" : undefined}
                className={cn(
                  "p-2 text-caption font-medium text-foreground-muted",
                  column.align === "end" ? "text-right" : "text-left",
                )}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-tight",
                      "transition-colors duration-fast ease-standard outline-none",
                      "hover:text-foreground",
                    )}
                  >
                    {column.header}
                    {active ? (
                      sort.direction === "ascending" ? (
                        <ArrowUp aria-hidden="true" className="size-3" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="size-3" />
                      )
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            )
          })}
        </tr>
      </thead>

      <tbody>
        {sorted.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length + (selection === undefined ? 0 : 1)}
              className="p-2 text-foreground-muted"
            >
              {empty ?? "Nothing to show."}
            </td>
          </tr>
        ) : (
          sorted.map((row) => {
            const id = rowId(row)
            const selected = selection?.selected.has(id) ?? false

            return (
              <tr
                key={id}
                // Announced as selected, not merely tinted.
                aria-selected={selection === undefined ? undefined : selected}
                className={cn(
                  "border-b border-border",
                  "transition-colors duration-fast ease-standard",
                  "hover:bg-surface-hover",
                  selected && "bg-primary-subtle",
                )}
              >
                {selection === undefined ? null : (
                  <td className="p-2">
                    <Checkbox
                      label={selection.label(row)}
                      checked={selected}
                      onCheckedChange={(checked) => {
                        const next = new Set(selection.selected)
                        if (checked === true) next.add(id)
                        else next.delete(id)
                        selection.onChange(next)
                      }}
                    />
                  </td>
                )}

                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "p-2 text-foreground",
                      column.align === "end" ? "text-right tabular-nums" : "text-left",
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
