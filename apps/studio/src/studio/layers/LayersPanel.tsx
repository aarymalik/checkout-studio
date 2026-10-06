"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from "react"
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen } from "lucide-react"
import {
  ROW_HEIGHT,
  expandAll,
  expansionFor,
  flatten,
  indent,
  isLocked,
  isUnsupported,
  moveDown,
  moveUp,
  outdent,
  rowAfter,
  scrollToRow,
  searchLayers,
  useEditorStore,
  useEditorStoreApi,
  windowFor,
  type Expansion,
  type LayerRow,
  type Move,
} from "@checkout-studio/editor"
import { EmptyState, ScrollArea, SearchInput, cn } from "@checkout-studio/ui"

/**
 * The Layers panel.
 *
 * The document as a list, virtualized: only the rows in view are rendered, and
 * the rest is replaced by height so the scrollbar still tells the truth. A
 * 2,000-node page is 2,000 rows, which is more than a frame budget allows.
 *
 * A tree to a screen reader, a flat list to the DOM. `role="tree"` with
 * `aria-level` carries the structure that indentation shows sighted users; a
 * nested list would say the same thing and could not be windowed. One tab stop
 * for the whole tree, with `aria-activedescendant` naming the current row —
 * 2,000 tab stops is not navigation.
 *
 * The root is left out. It is not selectable on the canvas, and a row that
 * cannot be chosen teaches people to stop trying.
 *
 * See docs/editor-behavior.md § Layer Panel.
 */

/** How far each level indents. Enough to read, not enough to run out of width. */
const INDENT_PX = 12

/** The DOM id for a row, which is how `aria-activedescendant` points at one. */
function rowDomId(id: string): string {
  return `layer-${id}`
}

export function LayersPanel(): ReactElement {
  const store = useEditorStoreApi()
  const document = useEditorStore((state) => state.document)
  const selected = useEditorStore((state) => state.selection.ids)
  const canEdit = useEditorStore((state) => state.persistence.canEdit)

  /*
   * What the user collapsed, rather than what is expanded.
   *
   * Stored as the exception so the default survives a change of document: a new
   * page, or a container added to this one, opens expanded without anything
   * having to notice it appeared. Seeding "expanded" once from the document
   * goes stale the moment the document is replaced, and a stale seed that no
   * longer names the root hides every row.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  const tree = useRef<HTMLDivElement>(null)
  // State rather than a ref: the windowing needs a render once the scroller
  // exists, and a ref assignment does not cause one.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(0)

  const expanded: Expansion = useMemo(() => {
    const open = new Set(expandAll(document))

    for (const id of collapsed) open.delete(id)

    return open
  }, [document, collapsed])

  const all = useMemo(
    () => flatten(document, expanded, { includeRoot: false }),
    [document, expanded],
  )
  const { rows, matched } = useMemo(() => searchLayers(all, query), [all, query])

  /*
   * Selecting on the canvas reveals the row.
   *
   * The ancestors are expanded first, because scrolling to a row inside a
   * collapsed parent scrolls to a row that was never rendered.
   */
  useEffect(() => {
    if (selected.length === 0) return

    const ancestors = expansionFor(document, selected, new Set())

    setCollapsed((current) => {
      const next = new Set(current)

      for (const id of ancestors) next.delete(id)

      return next.size === current.size ? current : next
    })

    setActive(selected[0] ?? null)
  }, [selected, document])

  useEffect(() => {
    if (viewport === null) return

    const measure = (): void => {
      setHeight(viewport.clientHeight)
      setScrollTop(viewport.scrollTop)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)

    // Native rather than React's onScroll, which does not bubble: the element
    // that scrolls is inside the scroll area, not its root.
    viewport.addEventListener("scroll", measure, { passive: true })

    return () => {
      observer.disconnect()
      viewport.removeEventListener("scroll", measure)
    }
  }, [viewport])

  // Keeps the current row on screen when the keyboard moves it, which is the
  // only way a keyboard user can tell where they are.
  useEffect(() => {
    if (viewport === null || active === null) return

    const index = rows.findIndex((row) => row.id === active)

    if (index === -1) return

    const to = scrollToRow(index, viewport.scrollTop, viewport.clientHeight)

    // Assigned rather than scrollTo: there is nothing to animate, and the
    // property is the one part of scrolling every environment implements.
    if (to !== null) viewport.scrollTop = to
  }, [active, rows, viewport])

  const view = windowFor(rows.length, scrollTop, height)
  const visible = rows.slice(view.start, view.end)

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)

      if (!next.delete(id)) next.add(id)

      return next
    })
  }, [])

  const applyMove = useCallback(
    (move: Move | null): boolean => {
      if (move === null || !canEdit) return false

      /*
       * A locked node stays put, and so does a locked destination.
       *
       * docs/editor-behavior.md § Lock: a locked component "cannot move". This
       * checked only whether the session could write, so Alt and an arrow key
       * reordered a locked node — the one path to reordering that existed, and
       * the lock did not reach it. `isLocked` is self-or-ancestor, so a locked
       * container protects what is inside it as well as its own order.
       */
      if (isLocked(document, move.id) || isLocked(document, move.parentId)) return false

      store.getState().move(move.id, move.parentId, move.index)

      return true
    },
    [store, canEdit, document],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const id = active

      // Alt turns the arrows from navigation into reordering: the convention
      // every outliner uses, and the only way to reorder without a pointer
      // until drag arrives in Phase 8.
      if (event.altKey) {
        if (id === null) return

        const move =
          event.key === "ArrowUp"
            ? moveUp(document, id)
            : event.key === "ArrowDown"
              ? moveDown(document, id)
              : event.key === "ArrowRight"
                ? indent(document, id)
                : event.key === "ArrowLeft"
                  ? outdent(document, id)
                  : null

        if (move === null) return

        event.preventDefault()
        applyMove(move)
        return
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()

        const next = rowAfter(rows, id, event.key === "ArrowDown" ? 1 : -1)

        setActive(next)
        if (next !== null) store.getState().select([next])
        return
      }

      if (id === null) return

      if (event.key === "ArrowRight" && !expanded.has(id)) {
        event.preventDefault()
        toggle(id)
        return
      }

      if (event.key === "ArrowLeft" && expanded.has(id)) {
        event.preventDefault()
        toggle(id)
        return
      }

      // F2 only. docs/keyboard-shortcuts.md reserves Enter for walking the
      // tree, and a second meaning here would collide with it the moment that
      // binding lands.
      if (event.key === "F2" && canEdit) {
        event.preventDefault()
        setRenaming(id)
      }
    },
    [active, rows, document, expanded, applyMove, toggle, store, canEdit],
  )

  const endRename = useCallback(
    (name: string | null) => {
      const id = renaming

      setRenaming(null)
      tree.current?.focus()

      if (id === null || name === null) return

      store.getState().rename(id, name)
    },
    [renaming, store],
  )

  if (all.length === 0 && query === "") {
    return (
      <EmptyState
        title="Nothing here yet"
        description="Elements you add to this page will be listed here."
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SearchInput
        label="Search layers"
        value={query}
        onValueChange={setQuery}
        placeholder="Search layers"
      />

      {rows.length === 0 ? (
        <EmptyState title="No matches" description="Nothing on this page has that name." />
      ) : (
        <ScrollArea
          className="-mx-1 min-h-0 flex-1"
          viewportClassName="px-1"
          viewportRef={setViewport}
        >
          {/* The full height, with the rows outside the window replaced by it. */}
          <div style={{ height: view.total }} className="relative">
            <div
              ref={tree}
              role="tree"
              aria-label="Layers"
              aria-activedescendant={active === null ? undefined : rowDomId(active)}
              tabIndex={0}
              onKeyDown={onKeyDown}
              className="absolute inset-x-0 rounded-tight focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
              style={{ top: view.above }}
            >
              {visible.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  selected={selected.includes(row.id)}
                  active={active === row.id}
                  dimmed={query !== "" && !matched.has(row.id)}
                  canEdit={canEdit}
                  renaming={renaming === row.id}
                  onRenamed={endRename}
                  onSelect={() => {
                    setActive(row.id)
                    store.getState().select([row.id])
                  }}
                  onRename={() => setRenaming(row.id)}
                  onToggle={() => toggle(row.id)}
                  onLock={() => store.getState().setLocked([row.id], !row.locked)}
                  onHide={() => store.getState().setHidden([row.id], !row.hidden)}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function Row({
  row,
  selected,
  active,
  dimmed,
  canEdit,
  renaming,
  onSelect,
  onRename,
  onRenamed,
  onToggle,
  onLock,
  onHide,
}: {
  row: LayerRow
  selected: boolean
  active: boolean
  /** Kept for context during a search, without pretending it matched. */
  dimmed: boolean
  canEdit: boolean
  renaming: boolean
  onSelect: () => void
  onRename: () => void
  onRenamed: (name: string | null) => void
  onToggle: () => void
  onLock: () => void
  onHide: () => void
}): ReactElement {
  const Chevron = row.expanded ? ChevronDown : ChevronRight

  return (
    <div
      id={rowDomId(row.id)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      className={cn(
        "group flex items-center gap-1 rounded-tight pr-1",
        "transition-colors duration-fast ease-standard",
        "hover:bg-surface-hover",
        selected && "bg-primary-subtle",
        // The active row is where the keyboard is. It is drawn even when the
        // tree does not hold focus, so returning to the panel is not a guess.
        active && !selected && "bg-surface-hover",
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: row.depth * INDENT_PX }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
          onClick={onToggle}
          className="shrink-0 rounded-tight p-1 text-foreground-muted hover:text-foreground"
        >
          <Chevron aria-hidden="true" className="size-3" />
        </button>
      ) : (
        // Keeps leaf labels aligned with container labels, so the indentation
        // reads as depth rather than as noise.
        <span aria-hidden className="size-5 shrink-0" />
      )}

      {renaming ? (
        <RenameField label={row.label} onDone={onRenamed} />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          onClick={onSelect}
          onDoubleClick={canEdit ? onRename : undefined}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-caption",
            // An ancestor's row says what was hidden. A descendant only
            // inherits it, and dimming the whole subtree would suggest nine
            // decisions where there was one.
            row.hidden || row.inheritedHidden ? "text-foreground-subtle" : "text-foreground",
            dimmed && "text-foreground-subtle",
          )}
        >
          {row.label}
          {isUnsupported(row) ? (
            <span className="ml-1 text-foreground-subtle">· needs a plugin</span>
          ) : null}
        </button>
      )}

      {canEdit && !renaming ? (
        <>
          <RowAction
            label={row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
            pressed={row.hidden}
            onClick={onHide}
          >
            {row.hidden ? (
              <EyeOff aria-hidden="true" className="size-3" />
            ) : (
              <Eye aria-hidden="true" className="size-3" />
            )}
          </RowAction>
          <RowAction
            label={row.locked ? `Unlock ${row.label}` : `Lock ${row.label}`}
            pressed={row.locked}
            onClick={onLock}
          >
            {row.locked ? (
              <Lock aria-hidden="true" className="size-3" />
            ) : (
              <LockOpen aria-hidden="true" className="size-3" />
            )}
          </RowAction>
        </>
      ) : null}
    </div>
  )
}

/**
 * Renaming in place.
 *
 * Starts selected, because a rename almost always replaces the name rather than
 * appending to it. Enter and blur commit, Escape abandons — and an empty name
 * commits as empty, which clears the custom name and returns the row to the
 * component's own.
 */
function RenameField({
  label,
  onDone,
}: {
  label: string
  onDone: (name: string | null) => void
}): ReactElement {
  const [value, setValue] = useState(label)
  const field = useRef<HTMLInputElement>(null)
  const committed = useRef(false)

  // The rename was asked for, so focus belongs in the field that replaced the
  // label — and the text selected, because a rename usually replaces the name.
  //
  // Focus and select, in that order: select() sets a selection range and does
  // not move focus, so on its own it leaves the typing going to the tree, which
  // reads Enter as "start another rename".
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  const finish = (name: string | null): void => {
    if (committed.current) return

    committed.current = true
    onDone(name)
  }

  return (
    <input
      ref={field}
      aria-label={`Rename ${label}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        // Stops the tree seeing these: Enter would start another rename and the
        // arrows would move the selection out from under the field.
        event.stopPropagation()

        if (event.key === "Enter") finish(value)
        if (event.key === "Escape") finish(null)
      }}
      className={cn(
        "min-w-0 flex-1 rounded-tight border border-border-strong bg-surface px-1",
        "text-caption text-foreground outline-none",
      )}
    />
  )
}

/**
 * Hidden until the row is hovered, or the action is on.
 *
 * A column of eyes and padlocks down every row is noise. One that appears under
 * the pointer, and stays once it has been used, is not.
 */
function RowAction({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-tight p-1 text-foreground-muted",
        "transition-opacity duration-fast ease-standard",
        "hover:text-foreground",
        pressed ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {children}
    </button>
  )
}
