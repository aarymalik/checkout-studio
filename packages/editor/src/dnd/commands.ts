import type { Command, CommandDescriptor, EditorContext } from "../commands/types"
import type { EditorStoreApi } from "../state/store"
import type { KeyboardDrag } from "../state/types"
import { pickUp, stepDrag, type DragStep } from "./keyboard"
import type { DropRules } from "./validity"

/**
 * Moving a node with the keyboard.
 *
 * docs/keyboard-shortcuts.md § Keyboard drag and drop. `M` picks a node up, the
 * arrows move the drop indicator, `↵` drops it as one history entry and
 * `Escape` puts it back.
 *
 * Commands rather than a handler in the canvas, for the reason the rest of this
 * project uses them: a keystroke, the palette and a reference sheet all reach
 * one definition, and a modal gesture nobody can discover is a gesture nobody
 * uses. It is also what makes the modality work — the four arrows, `↵` and
 * `Escape` are bound in `canvas.dragging`, which is deeper than
 * `canvas.selection`, so while something is in the hand they win and when
 * nothing is they are not even consulted.
 *
 * The pointer's drag is not built this way, and should not be: moving a pointer
 * is not a command.
 */

export const dndCommandDescriptors: readonly CommandDescriptor[] = [
  {
    id: "dnd.pick-up",
    title: "Pick up for moving",
    category: "arrange",
    keywords: ["move", "drag", "pick", "lift", "keyboard"],
  },
  {
    id: "dnd.step-up",
    title: "Move the drop position up",
    category: "arrange",
    keywords: ["drag", "up", "earlier", "before"],
  },
  {
    id: "dnd.step-down",
    title: "Move the drop position down",
    category: "arrange",
    keywords: ["drag", "down", "later", "after"],
  },
  {
    id: "dnd.step-in",
    title: "Move the drop position into the container above",
    category: "arrange",
    keywords: ["drag", "into", "indent", "nest"],
  },
  {
    id: "dnd.step-out",
    title: "Move the drop position out of its container",
    category: "arrange",
    keywords: ["drag", "out", "outdent", "lift"],
  },
  {
    id: "dnd.drop",
    title: "Drop it here",
    category: "arrange",
    keywords: ["drag", "drop", "commit", "place"],
  },
  {
    id: "dnd.cancel",
    title: "Put it back",
    category: "arrange",
    keywords: ["drag", "cancel", "abandon", "escape"],
  },
]

export interface DndCommandOptions extends DropRules {
  /** Null before a page is open, and after one closes. */
  store: () => EditorStoreApi | null
}

const STEPS: Record<string, DragStep> = {
  "dnd.step-up": "up",
  "dnd.step-down": "down",
  "dnd.step-in": "in",
  "dnd.step-out": "out",
}

export function createDndCommands(options: DndCommandOptions): readonly Command[] {
  const { store } = options
  const rules: DropRules = {
    ...(options.canHaveChildren === undefined ? {} : { canHaveChildren: options.canHaveChildren }),
    ...(options.nameOf === undefined ? {} : { nameOf: options.nameOf }),
  }

  /** The store, when there is one and this session may write to it. */
  function writable(): EditorStoreApi | null {
    const api = store()

    if (api === null) return null

    return api.getState().persistence.canEdit ? api : null
  }

  /** The store and the node in the hand, when there is both. */
  function held(): { api: EditorStoreApi; drag: KeyboardDrag } | null {
    const api = writable()
    const drag = api === null ? null : api.getState().drag.keyboard

    return api === null || drag === null ? null : { api, drag }
  }

  const behaviour: Record<string, (context: EditorContext) => void> = {
    "dnd.pick-up": () => {
      const api = writable()

      if (api === null) return

      const id = api.getState().selection.ids[0]

      if (id === undefined) return

      const drag = pickUp(api.getState().document, id, rules)

      if (drag === null) return

      /*
       * Announced by deriving, not by pushing.
       *
       * The canvas's live region already reads the store to say what is
       * selected; a keyboard drag is a thing the store holds, so it says that
       * instead while one is held. A second channel for the same job would be
       * two places to keep a sentence.
       */
      api.getState().setKeyboardDrag(drag)
    },

    "dnd.drop": () => {
      const holding = held()

      if (holding === null) return

      const { api, drag } = holding

      api.getState().setKeyboardDrag(null)

      // Back where it started is not a move. Writing one would put an entry in
      // history that undoes to the same thing.
      if (drag.steps === 0) return

      // One transaction, so one history entry — which is what the exit
      // criterion asks for and what makes a single undo put it back.
      api.getState().transact("Move", () => {
        api.getState().move(drag.id, drag.parentId, drag.index)
      })
    },

    "dnd.cancel": () => {
      const holding = held()

      if (holding === null) return

      holding.api.getState().setKeyboardDrag(null)
      // Nothing to undo: the move was never written. Cancelling is the absence
      // of a change rather than the reversal of one.
    },
  }

  for (const [id, step] of Object.entries(STEPS)) {
    behaviour[id] = () => {
      const holding = held()

      if (holding === null) return

      const next = stepDrag(holding.drag, step, rules)

      // Unchanged means nothing moved and there is nothing new to say — the
      // end of a list, or the same refusal a second time. Writing it would
      // re-announce a sentence the user has already heard.
      if (next === holding.drag) return

      holding.api.getState().setKeyboardDrag(next)
    }
  }

  return dndCommandDescriptors.map((descriptor) => ({
    ...descriptor,
    isAvailable: (context: EditorContext) => {
      const api = writable()

      if (context.isEditingText || api === null) return false

      // Picking up needs a selection and nothing in the hand; everything else
      // needs something in the hand. Read from the store `writable` just
      // returned rather than looking it up again, which would mean handling a
      // null it has already ruled out.
      const { drag, selection } = api.getState()

      return descriptor.id === "dnd.pick-up"
        ? drag.keyboard === null && selection.ids.length > 0
        : drag.keyboard !== null
    },
    run: (context: EditorContext) => {
      if (context.isEditingText) return

      behaviour[descriptor.id]?.(context)
    },
    /*
     * Only the drop writes to the document. Picking up, stepping and cancelling
     * move a pending position around and touch nothing — which is why Escape
     * leaves no history entry to undo.
     */
    mutates: descriptor.id === "dnd.drop",
  }))
}
