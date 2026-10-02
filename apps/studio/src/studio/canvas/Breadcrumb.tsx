"use client"

import { labelFor, useEditorStore, useEditorStoreApi } from "@checkout-studio/editor"
import { ancestors } from "@checkout-studio/schema"
import type { ReactElement } from "react"

/**
 * The path from the page down to what is selected.
 *
 * The fastest way to reach a parent: a user who has clicked into a button three
 * levels deep gets back out with one click instead of Escape, Escape, Escape or
 * a trip to the layers panel.
 *
 * Rendered as a list of buttons rather than links, because selecting a node is
 * not navigation and the back button should not undo it.
 *
 * See docs/editor-behavior.md § Breadcrumb Navigation.
 */
export function Breadcrumb(): ReactElement | null {
  const store = useEditorStoreApi()
  const document = useEditorStore((state) => state.document)
  const selected = useEditorStore((state) => state.selection.ids)
  const primary = selected[0]

  if (primary === undefined) return null

  const chain = ancestors(document, primary)

  // Empty when the node is gone or its chain is broken. Showing a partial path
  // as if it were whole is worse than showing none.
  if (chain.length === 0) return null

  return (
    <nav
      aria-label="Selected element path"
      className="flex min-w-0 items-center gap-1 overflow-hidden text-caption text-foreground-muted"
    >
      {chain.map((node, index) => {
        const last = index === chain.length - 1

        return (
          <span key={node.id} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <span aria-hidden>/</span> : null}
            <button
              type="button"
              aria-current={last ? "true" : undefined}
              onClick={() => store.getState().select([node.id])}
              className={`truncate rounded-sm px-1 hover:bg-surface-raised ${
                last ? "text-foreground" : ""
              }`}
            >
              {labelFor(node)}
            </button>
          </span>
        )
      })}
    </nav>
  )
}
