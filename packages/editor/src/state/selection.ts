import { siblings } from "@checkout-studio/schema"

import type { Command, CommandDescriptor, EditorContext } from "../commands/types"
import type { EditorStoreApi } from "./store"

/**
 * Walking the tree with the keyboard.
 *
 * Phase 7's last exit criterion is "full canvas navigation by keyboard", and
 * none of it was reachable. `selectParent`, `selectFirstChild` and
 * `selectSibling` have been in the store since Phase 5, tested, exported, and
 * called by nothing outside their own tests — so every binding in
 * docs/keyboard-shortcuts.md § Selection did nothing, and the only way to
 * select a node in the canvas was to click it.
 *
 * Which is not a minor gap. A canvas reachable only by pointer fails WCAG 2.1.1
 * outright, and this project's rule is that accessibility is mandatory rather
 * than a later pass.
 *
 * None of these changes the document. Selection is not an edit: it produces no
 * history entry and must never make a page dirty, so they all declare
 * themselves non-mutating and the store's selection actions write only to
 * `selection`.
 *
 * See docs/keyboard-shortcuts.md § Selection.
 */

/**
 * One command, as a plan rather than a pair of answers.
 *
 * `plan` returns the thing to do, or null when there is nothing to do. The
 * shape arrange.ts settled on: asking "can this act?" and "what would it do?"
 * separately means the second has to handle a case the first already refused,
 * which is a branch no test can reach.
 */
interface SelectionCommandSpec {
  title: string
  keywords: readonly string[]
  plan: (api: EditorStoreApi) => (() => void) | null
}

/** The one node these act from: the primary selection. */
function primary(api: EditorStoreApi): string | null {
  return api.getState().selection.ids[0] ?? null
}

const SELECTION_COMMANDS: Readonly<Record<string, SelectionCommandSpec>> = {
  "selection.all-siblings": {
    title: "Select all siblings",
    keywords: ["all", "siblings", "group", "everything"],
    plan: (api) => {
      const id = primary(api)

      if (id === null) return null

      /*
       * `siblings` includes the node itself, which is what "all siblings"
       * means here: the whole group, not the others. It is never empty for a
       * selected node — see the note on `sibling` below.
       */
      return () => {
        api.getState().select(siblings(api.getState().document, id))
      }
    },
  },

  "selection.next-sibling": {
    title: "Select the next sibling",
    keywords: ["next", "sibling", "forward", "tab"],
    plan: (api) => (sibling(api, 1) === null ? null : () => api.getState().selectSibling(1)),
  },

  "selection.previous-sibling": {
    title: "Select the previous sibling",
    keywords: ["previous", "sibling", "back", "tab"],
    plan: (api) => (sibling(api, -1) === null ? null : () => api.getState().selectSibling(-1)),
  },

  "selection.parent": {
    title: "Select the parent",
    keywords: ["parent", "up", "out", "container", "enclosing"],
    plan: (api) => {
      const id = primary(api)
      const parentId = id === null ? null : api.getState().document.nodes[id]?.parentId

      if (parentId === undefined || parentId === null) return null

      return () => {
        api.getState().selectParent()
      }
    },
  },

  "selection.enter": {
    title: "Select the first child",
    keywords: ["enter", "into", "down", "first", "child"],
    /*
     * Half of a command that will have three branches.
     *
     * docs/keyboard-shortcuts.md § Selection describes ↵ as one context-aware
     * command: a text node enters text edit mode, a node with children selects
     * its first child, and anything else does nothing. Text edit mode does not
     * exist yet — there are no text components until Phase 9 and no inline
     * editor until Phase 12 — so this is the middle branch, and the binding is
     * the same one the first branch will take when it arrives.
     */
    plan: (api) => {
      const id = primary(api)
      const child = id === null ? undefined : api.getState().document.nodes[id]?.children[0]

      if (child === undefined) return null

      return () => {
        api.getState().selectFirstChild()
      }
    },
  },

  "selection.clear": {
    title: "Clear the selection",
    keywords: ["clear", "deselect", "none", "escape"],
    plan: (api) => {
      if (api.getState().selection.ids.length === 0) return null

      return () => {
        api.getState().clearSelection()
      }
    },
  },
}

/**
 * The sibling in `direction`, or null at the end of the row.
 *
 * A selected node is always in the tree and always in its parent's children, so
 * neither "this node does not exist" nor "it is not among its siblings" is
 * checked for here. That is not an assumption: `select` filters out ids the
 * document does not contain, `remove` prunes the selection, and Phase 5's exit
 * criteria hold that no sequence of operations produces an inconsistent tree.
 * Guarding against it again would add a branch no test could reach, which is
 * the mistake commands.ts records in its own table.
 */
function sibling(api: EditorStoreApi, direction: 1 | -1): string | null {
  const id = primary(api)

  if (id === null) return null

  const order = siblings(api.getState().document, id)

  // No wrapping. Tab at the last sibling does nothing rather than jumping back
  // to the first, which is what "select next sibling" says and what keeps the
  // row's ends findable without counting.
  return order[order.indexOf(id) + direction] ?? null
}

export const selectionCommandDescriptors: readonly CommandDescriptor[] = Object.entries(
  SELECTION_COMMANDS,
).map(([id, spec]) => ({ id, title: spec.title, category: "selection", keywords: spec.keywords }))

export interface SelectionCommandOptions {
  /** Null before a page is open, and after one closes. */
  store: () => EditorStoreApi | null
}

export function createSelectionCommands({ store }: SelectionCommandOptions): readonly Command[] {
  return Object.entries(SELECTION_COMMANDS).map(([id, spec]) => ({
    id,
    title: spec.title,
    category: "selection" as const,
    keywords: spec.keywords,
    /*
     * Available in a read-only session, unlike every editing command.
     *
     * Looking is not writing. A session that may only read still needs to walk
     * the page and see what is in the inspector, and a locked node "remains
     * selectable" by the same reasoning — docs/editor-behavior.md § Lock.
     */
    isAvailable: (context: EditorContext) => {
      const api = store()

      return api !== null && !context.isEditingText && spec.plan(api) !== null
    },
    run: (context: EditorContext) => {
      const api = store()

      if (api === null || context.isEditingText) return

      // Planned again rather than trusted: availability was decided before the
      // keystroke, and the selection can move between the two.
      spec.plan(api)?.()
    },
    // Selection is not an edit. No history entry, and the page is not dirtied.
    mutates: false,
  }))
}
