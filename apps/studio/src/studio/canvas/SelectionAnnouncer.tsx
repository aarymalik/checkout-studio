"use client"

import { useMemo } from "react"
import type { ReactElement } from "react"
import { describeDrag, labelFor, useEditorStore } from "@checkout-studio/editor"
import { siblings } from "@checkout-studio/schema"

/**
 * What a screen reader hears when the selection moves.
 *
 * The canvas is now navigable by keyboard — `Tab` walks the siblings, `↵` and
 * `⇧↵` walk down and up the tree — and none of that moves focus. Focus stays
 * where it was, because the thing being selected is a node in a rendered page
 * rather than a control. So without this, every one of those keystrokes is
 * silent: the outline moves and nothing is announced.
 *
 * `aria-activedescendant` would be the usual answer and is not available here.
 * It needs an id on the element, and the renderer emits only a class — on
 * purpose, because the same renderer draws the published checkout, where ids
 * are a namespace shared with whatever else is on the page. Putting one there
 * for the editor's benefit would be builder concerns reaching into the
 * renderer, which docs/architecture.md forbids. A live region belongs to the
 * editor and costs the published page nothing.
 *
 * Polite rather than assertive: this is feedback on something the user just
 * did, not an interruption.
 */
export function SelectionAnnouncer(): ReactElement {
  const document = useEditorStore((state) => state.document)
  const selected = useEditorStore((state) => state.selection.ids)
  const drag = useEditorStore((state) => state.drag.keyboard)

  const message = useMemo(() => {
    /*
     * A node in the hand outranks the selection.
     *
     * "Each candidate position is announced", per docs/keyboard-shortcuts.md
     * § Keyboard drag and drop — and while something is being carried, where it
     * would land is the only thing the user is waiting to hear. Derived rather
     * than pushed: the store holds the drag, so this says what the store holds
     * and there is no second place keeping the same sentence.
     *
     * `labelFor` for the same reason the selection below uses it: without it
     * this read "after Footer, in page_hhhh", naming the container by its id —
     * and an id is not a thing the user has ever seen.
     */
    if (drag !== null) return describeDrag(drag, { nameOf: labelFor })

    if (selected.length === 0) return "Nothing selected"

    // A count rather than each name. Five names read in sequence tells nobody
    // anything, and the inspector is where a multiple selection is worked on.
    if (selected.length > 1) return `${selected.length} components selected`

    const id = selected[0] as string
    const node = document.nodes[id]

    if (node === undefined) return "Nothing selected"

    /*
     * The position among siblings, because `Tab` is how it was reached.
     *
     * "Section" twice in a row is indistinguishable from a key that did
     * nothing. "Section, 2 of 4" says both what is selected and that the
     * keystroke worked.
     */
    const row = siblings(document, id)
    const index = row.indexOf(id)
    const place = index === -1 ? "" : `, ${index + 1} of ${row.length}`
    const locked = node.metadata.locked ? ", locked" : ""
    const hidden = node.visibility.hidden ? ", hidden" : ""

    return `${labelFor(node)}${place}${locked}${hidden}`
  }, [document, selected, drag])

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  )
}
