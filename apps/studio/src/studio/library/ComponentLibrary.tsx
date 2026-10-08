"use client"

import { useCallback, useMemo, useState } from "react"
import type { ReactElement } from "react"
import {
  catalogOf,
  catalogSize,
  searchCatalog,
  useEditorStore,
  useEditorStoreApi,
  type LibraryEntry,
} from "@checkout-studio/editor"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"
import { EmptyState, SearchInput, cn } from "@checkout-studio/ui"

import { registry as shippedRegistry } from "@/studio/registry"

/**
 * The component library.
 *
 * Built from the registry rather than from a list, which is what makes a
 * plugin's components appear by being registered — there is nothing here to
 * update when one arrives. Grouped by the canonical categories in
 * docs/component-library.md, in that order, with the empty ones left out.
 *
 * Inserting is a button, not only a drag. A list you can only drag from is a
 * list some people cannot use, and the keyboard path has to be the same path:
 * activating an entry inserts it where the selection is, which is also the
 * fastest way to work for anybody who is already typing.
 *
 * See docs/phases.md Phase 8.
 */

export interface ComponentLibraryProps {
  /**
   * What is registered.
   *
   * The build's own registry by default. Overridden by tests, which register
   * fixtures — the shipped one is empty until the component library lands in
   * Phase 9, and a panel tested against nothing tests nothing.
   */
  registry?: RendererRegistry
}

export function ComponentLibrary({
  registry = shippedRegistry,
}: ComponentLibraryProps): ReactElement {
  const store = useEditorStoreApi()
  const canEdit = useEditorStore((state) => state.persistence.canEdit)
  const selected = useEditorStore((state) => state.selection.ids)
  const document = useEditorStore((state) => state.document)
  const [query, setQuery] = useState("")

  // Built once per registry: it is the same object for the life of the
  // application, and the renderer memoises component resolution on it.
  const catalog = useMemo(() => catalogOf(registry), [registry])
  const groups = useMemo(() => searchCatalog(catalog, query), [catalog, query])

  /**
   * Where an inserted component goes.
   *
   * Inside the selection when it can hold children, beside it when it cannot,
   * and at the end of the page when nothing is selected. That is the same
   * reading the canvas gives a drop, so inserting by keyboard and inserting by
   * drag land in the same place.
   */
  const insert = useCallback(
    (entry: LibraryEntry) => {
      if (!canEdit) return

      const id = selected[0]
      const node = id === undefined ? undefined : document.nodes[id]

      if (node === undefined) {
        store.getState().insertNew(entry.type, document.root)
        return
      }

      const definition = registry.get(node.type)
      const parentId = definition?.container === true ? node.id : node.parentId

      if (parentId === null || parentId === undefined) {
        store.getState().insertNew(entry.type, document.root)
        return
      }

      const siblings = document.nodes[parentId]?.children ?? []
      const after = siblings.indexOf(node.id)

      store.getState().insertNew(entry.type, parentId, after === -1 ? undefined : after + 1)
    },
    [canEdit, selected, document, registry, store],
  )

  if (catalogSize(catalog) === 0) {
    return (
      /*
       * Worded apart from the canvas's empty state on purpose.
       *
       * The canvas says "No components yet" because it cannot draw the page.
       * This says there is nothing to add. They are different conditions, and
       * an end-to-end test asserts the first is said *once* — which it stopped
       * being the moment this panel used the same sentence.
       */
      <EmptyState
        title="Nothing to add yet"
        description="A plugin's components appear here by being registered, so this list fills itself as plugins arrive."
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SearchInput
        label="Search components"
        value={query}
        onValueChange={setQuery}
        placeholder="Search components"
      />

      {groups.length === 0 ? (
        <EmptyState title="No matches" description="No component has that name." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`library-${group.category}`}>
              <h3
                id={`library-${group.category}`}
                className="px-1 pb-1 text-caption font-medium text-foreground-muted"
              >
                {group.category}
              </h3>

              <ul className="flex flex-col">
                {group.entries.map((entry) => (
                  <li key={entry.type}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => insert(entry)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-tight px-2 py-1 text-left text-small",
                        "transition-colors duration-fast ease-standard",
                        "hover:bg-surface-hover",
                        "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                        "disabled:pointer-events-none disabled:opacity-40",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {/*
                        The type id, because the catalog names components by it
                        and somebody who has read the docs searches for it.
                      */}
                      <span className="shrink-0 text-tiny text-foreground-muted">{entry.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
