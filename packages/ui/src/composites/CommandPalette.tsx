import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Dialog, DialogContent } from "../overlays/Dialog"
import { parseQuery } from "./parseQuery"
import type { PaletteMode } from "./parseQuery"
import { cn } from "../lib/cn"

/**
 * The command palette.
 *
 * A listbox rather than a menu, driven by `aria-activedescendant`: focus stays
 * in the text field while the highlight moves through the results, which is what
 * lets a reader keep typing. Moving real focus onto each result would take it
 * out of the field after every keystroke.
 *
 * This is the shell. What appears in it comes from the command registry in
 * Phase 4 — the palette knows how to search, choose and announce, and nothing
 * about what a command does.
 *
 * Long result lists are not virtualised yet; docs/performance.md puts that with
 * the other lists in Phase 19.
 *
 * See docs/keyboard-shortcuts.md § Command Palette.
 */
export interface PaletteItem {
  id: string
  label: string
  /** The section it belongs to. Items are shown grouped, in the order given. */
  group?: string
  /** A hint on the right: a keyboard shortcut, a path, a type. */
  hint?: string
  icon?: ReactNode
  /** Extra words that should match, beyond the label. */
  keywords?: readonly string[]
  /** Whether choosing this opens a sub-menu rather than acting. */
  hasSubmenu?: boolean
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly PaletteItem[]
  /**
   * Runs an item.
   *
   * `alternate` is true when the reader held ⌘, which means "in a new context"
   * — open the page in a new tab rather than navigating.
   */
  onSelect: (item: PaletteItem, options: { alternate: boolean }) => void
  /** Called when the reader asks to enter an item's sub-menu with Tab. */
  onEnterSubmenu?: (item: PaletteItem) => void
  /** Narrows the list itself. Called whenever the mode prefix changes. */
  onModeChange?: (mode: PaletteMode) => void
  placeholder?: string
  emptyMessage?: string
}

/** Matches on the label and any keywords, case-insensitively. */
function matches(item: PaletteItem, query: string): boolean {
  if (query === "") return true

  const needle = query.toLowerCase()
  return (
    item.label.toLowerCase().includes(needle) ||
    (item.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(needle))
  )
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onSelect,
  onEnterSubmenu,
  onModeChange,
  placeholder = "Search commands, pages and components…",
  emptyMessage = "No results.",
}: CommandPaletteProps) {
  const listId = useId()
  const inputId = `${listId}-input`
  const [input, setInput] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const { mode, query } = parseQuery(input)
  const results = useMemo(() => items.filter((item) => matches(item, query)), [items, query])

  // Reopening a palette that remembered the last search is a palette that has
  // to be cleared before it can be used.
  useEffect(() => {
    if (open) {
      setInput("")
      setHighlighted(0)
    }
  }, [open])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  // A highlight pointing past the end of a shrinking list highlights nothing.
  useEffect(() => {
    setHighlighted((current) => (current >= results.length ? 0 : current))
  }, [results.length])

  const active = results[highlighted]

  function move(delta: number): void {
    if (results.length === 0) return

    setHighlighted((current) => {
      const next = (current + delta + results.length) % results.length
      // Keeping the highlight in view: the list scrolls, focus does not move.
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
      return next
    })
  }

  const groups = useMemo(() => {
    const order: string[] = []
    const bucket = new Map<string, PaletteItem[]>()

    for (const item of results) {
      const group = item.group ?? ""
      if (!bucket.has(group)) {
        bucket.set(group, [])
        order.push(group)
      }
      bucket.get(group)?.push(item)
    }

    return order.map((group) => ({ group, items: bucket.get(group) ?? [] }))
  }, [results])

  let index = -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Command palette"
        description="Search for a command, a page or a component."
        size="md"
        className="gap-0 p-0"
        // The field owns the keyboard. Radix would otherwise move focus to the
        // first focusable element, which is the close button.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(inputId)?.focus()
        }}
      >
        <input
          id={inputId}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={active === undefined ? undefined : `${listId}-${active.id}`}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={input}
          placeholder={placeholder}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              move(1)
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              move(-1)
            } else if (event.key === "Enter" && active !== undefined) {
              event.preventDefault()
              onSelect(active, { alternate: event.metaKey || event.ctrlKey })
            } else if (event.key === "Tab" && active?.hasSubmenu === true) {
              // Tab enters a sub-menu rather than leaving the field, but only
              // where there is one to enter — otherwise it still moves focus.
              event.preventDefault()
              onEnterSubmenu?.(active)
            }
          }}
          className={cn(
            "h-control-lg w-full border-b border-border bg-transparent px-4",
            "text-body-lg text-foreground placeholder:text-foreground-subtle",
            "outline-none",
          )}
        />

        {results.length === 0 ? (
          <p className="p-4 text-body text-foreground-muted">{emptyMessage}</p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            className="max-h-80 overflow-y-auto p-2"
          >
            {groups.map(({ group, items: grouped }) => (
              <li key={group === "" ? "ungrouped" : group} role="presentation">
                {group === "" ? null : (
                  <p className="px-2 py-2 text-caption text-foreground-subtle">{group}</p>
                )}

                <ul role="presentation">
                  {grouped.map((item) => {
                    index += 1
                    const current = index

                    return (
                      <li
                        key={item.id}
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={current === highlighted}
                        data-index={current}
                        onPointerMove={() => setHighlighted(current)}
                        onClick={(event) =>
                          onSelect(item, { alternate: event.metaKey || event.ctrlKey })
                        }
                        className={cn(
                          "flex cursor-default items-center gap-2 rounded-tight px-2 py-2",
                          "text-body text-foreground",
                          current === highlighted && "bg-surface-hover",
                        )}
                      >
                        {item.icon === undefined ? null : (
                          <span aria-hidden="true" className="flex size-4 items-center">
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1">{item.label}</span>
                        {item.hint === undefined ? null : (
                          <span aria-hidden="true" className="text-caption text-foreground-subtle">
                            {item.hint}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
